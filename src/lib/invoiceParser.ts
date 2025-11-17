// src/lib/invoiceParser.ts
// Plain TypeScript helper — no JSX here.

export type ParsedInvoice = {
  vendor?: string | null;
  invoiceNumber?: string | null;
  dateISO?: string | null;
  total?: number | null;
  currency?: string | null;
  orgNumber?: string | null;

  // Optional activity/emissions hints for later use
  energyKwh?: number | null;
  fuelLiters?: number | null;
  gasM3?: number | null;
  co2Kg?: number | null;
};

function toISODate(dmy: string | null): string | null {
  if (!dmy) return null;
  // dd.mm.yyyy or dd.mm.yy
  const m = dmy.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (!m) return null;
  let [_, dd, mm, yyyy] = m;
  if (yyyy.length === 2) {
    // naive pivot
    const two = parseInt(yyyy, 10);
    yyyy = (two >= 70 ? "19" : "20") + yyyy;
  }
  const d = Number(dd), mth = Number(mm);
  if (d < 1 || d > 31 || mth < 1 || mth > 12) return null;
  return `${yyyy.padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseMoney(n: string): number | null {
  // Accept formats like 9.969,00  |  9 969,00  |  9969,00  |  9969.00  |  9,969.00
  let s = n.trim();

  // remove currency tokens
  s = s.replace(/\b(NOK|kr|kr\.?)\b/gi, "").trim();

  // normalize spaces
  s = s.replace(/\s+/g, " ");

  // If comma is decimal (common in NO): "9 969,00"
  if (/,/.test(s) && /\d,\d{2}$/.test(s)) {
    s = s.replace(/[ .]/g, ""); // remove spaces/dots (thousands)
    s = s.replace(",", ".");    // decimal comma -> dot
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  }

  // If dot is decimal: "9969.00" or "9,969.00"
  s = s.replace(/,/g, ""); // remove thousands commas
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
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
  };

  if (!text) return out;

  // Preprocess
  const raw = text.replace(/\u00A0/g, " ");
  const lines = raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const full = lines.join("\n");

  // ---------------------------
  // Vendor (simple heuristics)
  // ---------------------------
  // Look for a company-ish line near the top (contains AS/ASA/A/S or capitalized words).
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const l = lines[i];
    if (/(AS|ASA|A\/S)\b/.test(l)) {
      // Avoid lines that are clearly address-only
      if (!/vei|gate|gata|street|road|post|oslo|bergen|trondheim|stavanger/i.test(l)) {
        out.vendor = l.replace(/\s{2,}/g, " ").trim();
        break;
      }
    }
  }
  // Fallback: the first fully capitalized words line that looks like a name
  if (!out.vendor) {
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const l = lines[i];
      if (/[A-ZÆØÅ][A-Za-zÆØÅæøå0-9 .,&'-]{4,}/.test(l) && !/\d{2}\.\d{2}\.\d{2,4}/.test(l)) {
        out.vendor = l.trim();
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
  // Date (dd.mm.yyyy common)
  // ---------------------------
  {
    // Prefer “Fakturadato”/“Invoice date”
    const dm =
      full.match(/(fakturadato|invoice\s*date)\s*[:\-]?\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})/i) ||
      full.match(/\b(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})\b/);
    const dmy = dm ? (dm[2] || dm[1]) : null;
    out.dateISO = toISODate(dmy || null);
  }

  // ---------------------------
  // Org number (9 digits near "Org")
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

  // Lines that often contain long numbers we should ignore for totals
  const BAD_LINE = /(kid|kid-?nummer|kontonummer|konto\.?nr|konto\s*nr|iban|swift|bank|kto\.?nr)/i;

  // Strong keywords that usually mark the payable total
  const STRONG_TOTAL = /(beløp\s*å\s*betale|belop\s*a\s*betale|amount\s*due|to\s*pay|sum\s*inkl\.?\s*mva|total\s*inkl\.?\s*mva|total\s*amount)/i;

  // Generic money finder (captures the numeric part in group 1)
  const MONEY = /(?:NOK|kr|kr\.)?\s*([0-9][0-9 .,\u00A0]{0,15}[0-9])(?:\b|$)/gi;

  // Normalize (we already have lines[])
  let best: number | null = null;
  let fromStrong = false;

  function parseFirstMoneyIn(line: string): number | null {
    let m: RegExpExecArray | null;
    while ((m = MONEY.exec(line))) {
      const val = parseMoney(m[1]);
      if (val == null) continue;

      // filter out obviously bogus totals (e.g. giant ID-like numbers)
      if (val > 1_000_000) continue;

      return val;
    }
    return null;
  }

  for (const l of lines) {
    if (BAD_LINE.test(l)) continue; // skip bank/KID/etc
    const strong = STRONG_TOTAL.test(l);
    const val = parseFirstMoneyIn(l);
    if (val == null) continue;

    if (strong) {
      // prefer strong markers like "Beløp å betale"
      if (!fromStrong || (best != null && val !== best)) {
        best = val;
        fromStrong = true;
      }
    } else if (!fromStrong) {
      // only consider non-strong lines if we haven't found a strong one
      if (best == null || val > best) best = val;
    }
  }

  if (best != null) out.total = best;


  // ---------------------------
  // Currency (default NOK if we saw NOK/kr anywhere)
  // ---------------------------
  if (/NOK|kr\b/i.test(full)) out.currency = "NOK";

  // ---------------------------
  // Activity hints (kWh, liters, m³)
  // ---------------------------
  {
    // kWh
    const km = full.match(/(\d[\d .,\u00A0]{0,12}\d)\s*kwh\b/i);
    if (km) out.energyKwh = parseMoney(km[1]);
    // liters
    const lm = full.match(/(\d[\d .,\u00A0]{0,12}\d)\s*(?:l|litre|liter)\b/i);
    if (lm) out.fuelLiters = parseMoney(lm[1]);
    // m3 gas
    const gm = full.match(/(\d[\d .,\u00A0]{0,12}\d)\s*(?:m3|m\u00B3)\b/i);
    if (gm) out.gasM3 = parseMoney(gm[1]);
  }

  return out;
}
