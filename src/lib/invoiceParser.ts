// src/lib/invoiceParser.ts
// Stronger full invoice parser for Norwegian invoices (Heimstaden, Telenor, Fortum, etc.)

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

  energyKwh?: number | null;
  fuelLiters?: number | null;
  gasM3?: number | null;
  co2Kg?: number | null;

  lines: ParsedInvoiceLine[];
};

function toISO(d: string): string | null {
  const m = d.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (!m) return null;
  let [_, dd, mm, yy] = m;
  if (yy.length === 2) yy = `20${yy}`;
  return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseMoney(text: string): number | null {
  const cleaned = text
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = Number(cleaned);
  return isFinite(num) ? num : null;
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

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const fullLower = lines.join(" ").toLowerCase();

  // 1️⃣ Vendor detection (strong, tuned for Norwegian invoices)
  const vendorPatterns = [
    /heimstaden property [0-9]+ as/i,
    /heimstaden property as/i,
    /heimstaden/i,
    /fortum/i,
    /telenor/i,
    /elvia/i,
    /lyse energi/i,
    /coor/i,
    /\b[A-ZÆØÅ][A-Za-z0-9 .,&/-]{3,}?(AS|ASA|A\/S)\b/i,
  ];

  for (const p of vendorPatterns) {
    const m = text.match(p);
    if (m) {
      out.vendor = m[0].trim();
      break;
    }
  }

  // 2️⃣ Invoice number
  const inv =
    text.match(/faktura(?:nr)?[:\s]*([A-Z0-9\-]{4,})/i) ||
    text.match(/\bFAKTURA[\s\-:]*([0-9]{4,})\b/i);
  if (inv) out.invoiceNumber = inv[1];

  // 3️⃣ Date
  const datePatterns = [
    /fakturadato[:\s]*([0-9]{1,2}[.\-/][0-9]{1,2}[.\-/][0-9]{2,4})/i,
    /dato[:\s]*([0-9]{1,2}[.\-/][0-9]{1,2}[.\-/][0-9]{2,4})/i,
    /\b([0-9]{1,2}[.\-/][0-9]{1,2}[.\-/][0-9]{2,4})\b/,
  ];
  for (const p of datePatterns) {
    const m = text.match(p);
    if (m) {
      out.dateISO = toISO(m[1]);
      break;
    }
  }

  // 4️⃣ Org number (9 digits)
  const orgMatch =
    text.match(/Org(?:\.)?\s*(?:nr|no|nummer)?\s*[:\-]?\s*([0-9][0-9 ]{7,}[0-9])/i) ||
    text.match(/\b([0-9]{3}\s?[0-9]{3}\s?[0-9]{3})\b/);
  if (orgMatch) {
    const digits = orgMatch[1].replace(/\s/g, "");
    if (/^\d{9}$/.test(digits)) out.orgNumber = digits;
  }

  // 5️⃣ Total amount
  const moneyMatches = text.match(
    /(?:beløp\s*å\s*betale|belop\s*a\s*betale|total|sum|amount\s*due)[^\d]*([\d .,\-]+)/gi
  );
  if (moneyMatches) {
    for (const m of moneyMatches) {
      const val = parseMoney(m);
      if (val && val > 0) out.total = val;
    }
  }

  // 6️⃣ Activity hints
  const kwh = text.match(/([\d .]+)\s*kwh/i);
  if (kwh) out.energyKwh = parseMoney(kwh[1]);

  const liter = text.match(/([\d .]+)\s*(liter|l)\b/i);
  if (liter) out.fuelLiters = parseMoney(liter[1]);

  const gas = text.match(/([\d .]+)\s*(m3|m³)/i);
  if (gas) out.gasM3 = parseMoney(gas[1]);

  // CO₂ rough estimate
  if (out.fuelLiters != null) out.co2Kg = out.fuelLiters * 2.68;
  if (out.energyKwh != null) out.co2Kg = out.energyKwh * 0.028;

  // 7️⃣ Line items – skipped for now (MVP)
  out.lines = [];

  return out;
}
