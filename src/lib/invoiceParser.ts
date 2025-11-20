// src/lib/invoiceParser.ts
// Plain TypeScript helper — no JSX here.

export type ParsedInvoiceLine = {
  description: string;
  quantity: number | null;
  unitRaw: string | null;
  amountNok: number | null;
};

export type ParsedInvoice = {
  vendor?: string | null;
  invoiceNumber?: string | null;
  dateISO?: string | null;
  total?: number | null;
  currency?: string | null;
  orgNumber?: string | null;

  // Activity / emissions hints
  energyKwh?: number | null;
  fuelLiters?: number | null;
  gasM3?: number | null;
  co2Kg?: number | null;

  // Parsed line items
  lines: ParsedInvoiceLine[];
};

function toISODate(dmy: string | null): string | null {
  if (!dmy) return null;
  // dd.mm.yyyy or dd.mm.yy
  const m = dmy.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (!m) return null;
  let [_, dd, mm, yyyy] = m;
  if (yyyy.length === 2) {
    const two = parseInt(yyyy, 10);
    yyyy = (two >= 70 ? "19" : "20") + yyyy;
  }
  const d = Number(dd), mth = Number(mm);
  if (d < 1 || d > 31 || mth < 1 || mth > 12) return null;
  return `${yyyy.padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseMoney(n: string): number | null {
  let s = n.trim();

  // remove currency tokens
  s = s.replace(/\b(NOK|kr|kr\.?)\b/gi, "").trim();
  s = s.replace(/\s+/g, " ");

  // If comma is decimal (common NO)
  if (/,/.test(s) && /\d,\d{2}$/.test(s)) {
    s = s.replace(/[ .]/g, "");
    s = s.replace(",", ".");
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  }

  // Dot decimal
  s = s.replace(/,/g, "");
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

// Very simple integer parser for quantities
function parseQuantity(q: string): number | null {
  let s = q.trim();
  s = s.replace(/\s+/g, "");
  s = s.replace(",", ".");
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return v;
}

function normalizeUnit(u: string | null): string | null {
  if (!u) return null;
  const x = u.toLowerCase();
  if (x === "l" || x.startsWith("liter") || x.startsWith("litre")) return "liter";
  if (x === "stk" || x === "st" || x === "pcs" || x === "pc") return "piece";
  if (x === "kg") return "kg";
  if (x === "m3" || x === "m³") return "m3";
  return x;
}

export default async function parseInvoice(text: string): Promise<ParsedInvoice> {
  const out: ParsedInvoice = {
    vendor: null,
    invoiceNumber: null,
    dateISO: null,
    total: null,
    currency: "NOK",
    orgNumber: null,
    energyKwh: null,
    fuelLiters: null,
    gasM3: null,
    co2Kg: null,
    lines: [],
  };

  if (!text) return out;

  const raw = text.replace(/\u00A0/g, " ");
  const lines = raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const full = lines.join("\n");

  // ---------------------------
  // Vendor heuristic
  // ---------------------------
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const l = lines[i];
    if (/(AS|ASA|A\/S)\b/.test(l)) {
      if (!/vei|gate|gata|street|road|post|oslo|bergen|trondheim|stavanger/i.test(l)) {
        out.vendor = l.replace(/\s{2,}/g, " ").trim();
        break;
      }
    }
  }

  // ---------------------------
  // Invoice number
  // ---------------------------
  {
    const m =
      full.match(/(?:fakturanr\.?|faktura\s*nr\.?|invoice\s*no\.?|invoice\s*#|faktura)\s*[:\-]?\s*([A-Z0-9\-]{4,})/i) ||
      full.match(/\bFAKTURA\s+([0-9]{4,})\b/i);
    if (m) out.invoiceNumber = m[1];
  }

  // ---------------------------
  // Date
  // ---------------------------
  {
    const dm =
      full.match(/(fakturadato|invoice\s*date)\s*[:\-]?\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/i) ||
      full.match(/\b(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})\b/);
    const dmy = dm ? (dm[2] || dm[1]) : null;
    out.dateISO = toISODate(dmy || null);
  }

  // ---------------------------
  // Org number (9 digits)
  // ---------------------------
  {
    const om =
      full.match(/Org(?:\.)?\s*(?:nr|no|nummer)?\s*[:\-]?\s*([0-9][0-9 ]{7,}[0-9])/i) ||
      full.match(/\b([0-9]{3}\s?[0-9]{3}\s?[0-9]{3})\b/);
    if (om) {
      const digits = om[1].replace(/\s/g, "");
      if (/^\d{9}$/.test(digits)) out.orgNumber = digits;
    }
  }

  // ---------------------------
  // Monetary total
  // ---------------------------
  const BAD_LINE = /(kid|kid-?nummer|kontonummer|konto\.?nr|konto\s*nr|iban|swift|bank|kto\.?nr)/i;
  const STRONG_TOTAL = /(beløp\s*å\s*betale|belop\s*a\s*betale|amount\s*due|to\s*pay|sum\s*inkl\.?\s*mva|total\s*inkl\.?\s*mva|total\s*amount|^total\b)/i;
  const MONEY = /(?:NOK|kr|kr\.)?\s*([0-9][0-9 .,\u00A0]{0,15}[0-9])(?:\b|$)/gi;

  let best: number | null = null;
  let fromStrong = false;

  function parseFirstMoneyIn(line: string): number | null {
    let m: RegExpExecArray | null;
    while ((m = MONEY.exec(line))) {
      const val = parseMoney(m[1]);
      if (val == null) continue;
      if (val > 1_000_000_000) continue;
      return val;
    }
    return null;
  }

  for (const l of lines) {
    if (BAD_LINE.test(l)) continue;
    const strong = STRONG_TOTAL.test(l);
    const val = parseFirstMoneyIn(l);
    if (val == null) continue;

    if (strong) {
      if (!fromStrong || (best != null && val !== best)) {
        best = val;
        fromStrong = true;
      }
    } else if (!fromStrong) {
      if (best == null || val > best) best = val;
    }
  }

  if (best != null) out.total = best;
  if (/NOK|kr\b/i.test(full)) out.currency = "NOK";

  // ---------------------------
  // Activity hints (kWh, liters, m³)
  // ---------------------------
  {
    const km = full.match(/(\d[\d .,\u00A0]{0,12}\d)\s*kwh\b/i);
    if (km) out.energyKwh = parseMoney(km[1]);
    const lm = full.match(/(\d[\d .,\u00A0]{0,12}\d)\s*(?:l|litre|liter)\b/i);
    if (lm) out.fuelLiters = parseMoney(lm[1]);
    const gm = full.match(/(\d[\d .,\u00A0]{0,12}\d)\s*(?:m3|m\u00B3)\b/i);
    if (gm) out.gasM3 = parseMoney(gm[1]);
  }

  // Rough CO2 estimate from fuel
  if (out.fuelLiters != null) {
    // Diesel ~ 2.68 kg CO₂ per liter (rough generic factor)
    out.co2Kg = out.fuelLiters * 2.68;
  }

  // ---------------------------
  // Line items
  // ---------------------------
  const parsedLines: ParsedInvoiceLine[] = [];

  for (const l of lines) {
    const lower = l.toLowerCase();

    // Skip obviously non-item lines
    if (/^invoice\b|^faktura\b/i.test(l)) continue;
    if (/^invoice text\b/i.test(lower)) continue;
    if (/^org\s*id\b/i.test(lower)) continue;
    if (/^org\.?nr\b/i.test(lower)) continue;

    // Skip pure total line – we already used it
    if (/^total\b/i.test(lower)) continue;

    // Pattern: "Something something 100 liter" or "Frozen fries 50 stk"
    const m = l.match(/^(.*?)(\d[\d .,\u00A0]*)\s*(stk|st|pcs|pc|liter|litre|l|kg|m3|m\u00B3)\b/i);
    if (!m) continue;

    const [, descRaw, qtyRaw, unitRaw] = m;
    const description = descRaw.trim().replace(/\s{2,}/g, " ");
    const quantity = parseQuantity(qtyRaw);
    const unit = unitRaw ? unitRaw.trim() : null;

    parsedLines.push({
      description: description || l,
      quantity,
      unitRaw: unit,
      amountNok: null,
    });
  }

  out.lines = parsedLines;
  return out;
}
