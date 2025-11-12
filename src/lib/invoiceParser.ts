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
  return raw.replace(/\r/g, "").replace(/\u00A0/g, " "); // NBSP -> space
}

// Robust number parser for NO/EU/US formats
function parseScandiNumber(s: string): number | undefined {
  let x = s.trim().replace(/\s/g, "");
  const lastComma = x.lastIndexOf(",");
  const lastDot = x.lastIndexOf(".");
  if (lastComma > lastDot) {
    x = x.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    x = x.replace(/,/g, "");
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

function safePickLargest(amounts: number[]) {
  // ignore clearly ridiculous amounts
  const filtered = amounts.filter((n) => n > 0 && n < 1_000_000_000);
  return filtered.length ? Math.max(...filtered) : undefined;
}

export default async function parseInvoice(text: string): Promise<ParsedInvoice> {
  const out: ParsedInvoice = {};
  const t = normalizeText(text);
  const lines = t.split("\n").map((s) => s.trim()).filter(Boolean);

  // Currency
  out.currency = t.match(/\b(NOK|EUR|USD|SEK|DKK)\b/i)?.[1]?.toUpperCase() ?? "NOK";

  // Date
  const dateISO =
    t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)?.[0] ??
    (() => {
      const m = t.match(/\b(\d{2})[./](\d{2})[./](\d{4})\b/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
    })();
  if (dateISO) out.dateISO = dateISO;

  // Invoice number
  const invNum =
    t.match(/(?:Invoice|Faktura)\s*(?:No|Nr|Number|#)\s*[:\-]?\s*([A-Z0-9\-]+)/i)?.[1];
  if (invNum) out.invoiceNumber = invNum;

  // Org.nr
  const orgMatch = t.match(/Org\.?\s*nr\.?\s*[:\-]?\s*([\d\s]{7,})/i);
  if (orgMatch) out.orgNumber = orgMatch[1].replace(/\s/g, "");

  // ---------------- VENDOR (improved) ----------------
  // 1) Prefer labeled lines
  const labeledVendor =
    t.match(/(?:Leverandør|Fra|From|Utsteder|Issuer|Selger)\s*[:\-]?\s*([^\n\r]+)/i)?.[1];
  const BAD_VENDOR = /(faktura|invoice|fakturanr|fakturanummer|fakturadato|kid|iban|konto|account|ordre)/i;

  if (labeledVendor && !BAD_VENDOR.test(labeledVendor) && !isMostlyDigits(labeledVendor)) {
    out.vendor = labeledVendor.replace(/\s{2,}/g, " ").trim();
  } else {
    // 2) Look near Org.nr (previous 1–2 lines)
    let candidate: string | undefined;
    const orgIdx = lines.findIndex((ln) => /org\.?\s*nr/i.test(ln));
    if (orgIdx > 0) {
      for (let i = Math.max(0, orgIdx - 2); i < orgIdx; i++) {
        const ln = lines[i];
        if (!BAD_VENDOR.test(ln) && !isMostlyDigits(ln) && /[A-Za-zÆØÅæøå]/.test(ln)) {
          candidate = ln;
          break;
        }
      }
    }
    // 3) Fallback: first non-numeric, non-"FAKTURA/INVOICE" title-ish line in the top block
    if (!candidate) {
      candidate = lines
        .slice(0, Math.min(12, lines.length))
        .find(
          (ln) =>
            ln.length >= 3 &&
            !isMostlyDigits(ln) &&
            !BAD_VENDOR.test(ln) &&
            !/^(faktura|invoice)\b/i.test(ln)
        );
    }
    if (candidate) out.vendor = candidate.replace(/\s{2,}/g, " ").trim();
  }

  // ---------------- TOTAL (improved) ----------------
  let total: number | undefined;

  // A) Try label on same line
  const labelRe =
    /(Total(?:t)?|Sum(?!\s*MVA)|Å\s*betale|Beløp\s*å\s*betale|Til\s*betaling|Amount\s*(?:Due|to\s*Pay)|Betales)\s*[:\-]?\s*([A-Z]*\s*[\d\s.,]+)(?:\s*(?:NOK|kr))?/iu;
  const mSame = t.match(labelRe);
  if (mSame?.[2]) total = parseScandiNumber(mSame[2]);

  // B) If not found, look for label then number on the *next* line
  if (total === undefined) {
    for (let i = 0; i < lines.length - 1; i++) {
      if (labelRe.test(lines[i])) {
        const nextNum = lines[i + 1].match(/([A-Z]*\s*[\d\s.,]+)(?:\s*(?:NOK|kr))?/i)?.[1];
        if (nextNum) {
          total = parseScandiNumber(nextNum);
          if (total !== undefined) break;
        }
      }
    }
  }

  // C) If still not found: collect all NOK/kr amounts and pick the largest, ignoring VAT rows
  if (total === undefined) {
    const amounts: number[] = [];
    for (const ln of lines) {
      if (/mva|moms|vat/i.test(ln)) continue; // ignore tax lines
      const rx = /(?:NOK|kr)\s*([\d\s.,]+)|([\d\s.,]+)\s*(?:NOK|kr)\b/gi;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(ln))) {
        const raw = m[1] || m[2];
        const n = raw ? parseScandiNumber(raw) : undefined;
        if (n !== undefined) amounts.push(n);
      }
    }
    const pick = safePickLargest(amounts);
    if (pick !== undefined) total = pick;
  }

  if (total !== undefined) out.total = Math.round(total * 100) / 100;

  return out;
}
