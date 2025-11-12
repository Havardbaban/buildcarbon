// src/lib/invoiceParser.ts

export type ParsedInvoice = {
  vendor?: string;
  invoiceNumber?: string;
  dateISO?: string;
  total?: number;
  currency?: string;
  orgNumber?: string;
  energy_kwh?: number;
  fuel_liters?: number;
  gas_m3?: number;
  co2_kg?: number;
};

function normalizeText(raw: string) {
  return raw
    .replace(/\r/g, "")
    .replace(/\u00A0/g, " "); // NBSP -> normal space
}

function parseScandiNumber(s: string): number | undefined {
  // Remove spaces
  let x = s.trim().replace(/\s/g, "");

  // Cases:
  //  - "9.969,00" (EU): dot thousands, comma decimals
  //  - "9 969,00" (EU) -> handled by space removal, then comma decimals
  //  - "9,969.00" (US): comma thousands, dot decimals
  //  - "9969,00" or "9969.00"
  // Decide by last separator:
  const lastComma = x.lastIndexOf(",");
  const lastDot = x.lastIndexOf(".");
  if (lastComma > lastDot) {
    // comma is decimal -> remove dots, switch comma to dot
    x = x.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // dot is decimal -> remove commas
    x = x.replace(/,/g, "");
  } else {
    // only digits (or weird) -> keep as-is
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function isMostlyDigits(s: string) {
  const t = s.replace(/[\s.,:;/\-]/g, "");
  if (!t) return false;
  const digits = (t.match(/\d/g) || []).length;
  return digits / t.length > 0.6;
}

export default async function parseInvoice(text: string): Promise<ParsedInvoice> {
  const out: ParsedInvoice = {};
  const t = normalizeText(text);

  // Currency
  const currency = t.match(/\b(NOK|EUR|USD|SEK|DKK)\b/i)?.[1]?.toUpperCase() ?? "NOK";
  out.currency = currency;

  // Date (YYYY-MM-DD or DD.MM.YYYY / DD/MM/YYYY)
  const dateISO =
    t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)?.[0] ??
    (() => {
      const m = t.match(/\b(\d{2})[./](\d{2})[./](\d{4})\b/);
      if (!m) return undefined;
      const [_, dd, mm, yyyy] = m;
      return `${yyyy}-${mm}-${dd}`;
    })();
  if (dateISO) out.dateISO = dateISO;

  // Invoice number
  const invNum =
    t.match(/(?:Invoice|Faktura)\s*(?:No|Nr|Number|#)\s*[:\-]?\s*([A-Z0-9\-]+)/i)?.[1];
  if (invNum) out.invoiceNumber = invNum;

  // Org.nr
  const orgMatch = t.match(/Org\.?\s*nr\.?\s*[:\-]?\s*([\d\s]{7,})/i);
  if (orgMatch) out.orgNumber = orgMatch[1].replace(/\s/g, "");

  // Vendor (prefer labeled forms; else first non-numeric-looking title line)
  const labeledVendor =
    t.match(/(?:Leverandør|Fra|From|Utsteder|Issuer)\s*[:\-]?\s*([^\n\r]+)/i)?.[1];
  if (labeledVendor && !isMostlyDigits(labeledVendor)) {
    out.vendor = labeledVendor.trim();
  } else {
    const firstTitle = t
      .split("\n")
      .map((s) => s.trim())
      .find((s) => s.length >= 3 && !isMostlyDigits(s) && /[A-Za-zÆØÅæøå]/.test(s));
    if (firstTitle) out.vendor = firstTitle.replace(/\s{2,}/g, " ");
  }

  // ---- TOTAL (robust) ----------------------------------------------------
  // 1) Try “Total / Sum / Å betale / Beløp å betale / Amount due” nearby
  const totalLabel = t.match(
    /(Total(?:t)?|Sum|Å\s*betale|Beløp\s*å\s*betale|Amount\s*Due|Amount\s*to\s*Pay)[^\n\r]{0,40}?([\d\s.,]+)/i
  );
  let total: number | undefined;
  if (totalLabel?.[2]) {
    total = parseScandiNumber(totalLabel[2]);
  }

  // 2) Otherwise collect all NOK-looking amounts and pick the largest
  if (total === undefined) {
    const amounts: number[] = [];
    const re = new RegExp(
      // number optionally followed/preceded by NOK
      `(?:NOK\\s*([\\d\\s.,]+)|([\\d\\s.,]+)\\s*NOK)`,
      "gi"
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const raw = m[1] || m[2];
      const n = raw ? parseScandiNumber(raw) : undefined;
      if (n !== undefined) amounts.push(n);
    }
    if (amounts.length) total = Math.max(...amounts);
  }

  if (total !== undefined) out.total = Math.round(total * 100) / 100;

  // --------- (leave CO2/energy hooks; you can extend later) ---------------
  return out;
}
