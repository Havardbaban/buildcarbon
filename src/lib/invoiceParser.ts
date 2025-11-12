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

// --- number helpers --------------------------------------------------------

function parseScandiNumberToken(s: string): number | undefined {
  // parse a *single* token like "9.969,00" or "9,969.00" or "9969,00"
  let x = s.trim();
  if (!x) return undefined;
  // drop spaces inside the token
  x = x.replace(/\s+/g, "");

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

function pickNumbersFromChunk(chunk: string): number[] {
  // find all numeric tokens in a chunk, parse each separately
  const tokens = chunk.match(/[\d][\d\s.,]*/g) || [];
  const nums = tokens
    .map((tok) => parseScandiNumberToken(tok))
    .filter((n): n is number => typeof n === "number" && isFinite(n));
  return nums;
}

function pickOneFromChunk(chunk: string): number | undefined {
  // prefer the LAST token on a total line (common layout), else the max
  const nums = pickNumbersFromChunk(chunk);
  if (!nums.length) return undefined;
  return nums[nums.length - 1] ?? Math.max(...nums);
}

function safePickLargest(amounts: number[]) {
  const filtered = amounts.filter((n) => n > 0 && n < 1_000_000_000);
  return filtered.length ? Math.max(...filtered) : undefined;
}

function isMostlyDigits(s: string) {
  const t = s.replace(/[\s.,:;/\-]/g, "");
  if (!t) return false;
  const digits = (t.match(/\d/g) || []).length;
  return digits / t.length > 0.6;
}

// --- main ------------------------------------------------------------------

export default async function parseInvoice(text: string): Promise<ParsedInvoice> {
  const out: ParsedInvoice = {};
  const t = normalizeText(text);
  const lines = t.split("\n").map((s) => s.trim()).filter(Boolean);

  // Currency
  out.currency = t.match(/\b(NOK|EUR|USD|SEK|DKK)\b/i)?.[1]?.toUpperCase() ?? "NOK";

  // Date (YYYY-MM-DD or DD.MM.YYYY / DD/MM/YYYY)
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

  // ---------------- VENDOR (stricter) ----------------
  const BAD_VENDOR =
    /(faktura|invoice|fakturanr|fakturanummer|fakturadato|kid|iban|konto|account|ordre|referanse|ref\.)/i;
  const ADDRESSISH = /(vei|veien|gate|gt\.?|road|street|postboks|\b\d{4}\s+[A-Za-z])/i;

  // 1) Labeled vendor
  const labeledVendor =
    t.match(/(?:Leverandør|Fra|From|Utsteder|Issuer|Selger)\s*[:\-]?\s*([^\n\r]+)/i)?.[1];
  if (
    labeledVendor &&
    !BAD_VENDOR.test(labeledVendor) &&
    !isMostlyDigits(labeledVendor) &&
    !ADDRESSISH.test(labeledVendor)
  ) {
    out.vendor = labeledVendor.replace(/\s{2,}/g, " ").trim();
  } else {
    // 2) Near Org.nr (previous 1–3 lines)
    let candidate: string | undefined;
    const orgIdx = lines.findIndex((ln) => /org\.?\s*nr/i.test(ln));
    if (orgIdx > 0) {
      for (let i = Math.max(0, orgIdx - 3); i < orgIdx; i++) {
        const ln = lines[i];
        if (
          ln.length >= 3 &&
          /[A-Za-zÆØÅæøå]/.test(ln) &&
          !BAD_VENDOR.test(ln) &&
          !ADDRESSISH.test(ln) &&
          !isMostlyDigits(ln) &&
          !/^(faktura|invoice)\b/i.test(ln)
        ) {
          candidate = ln;
          break;
        }
      }
    }
    // 3) Fallback: first clean top line
    if (!candidate) {
      candidate = lines
        .slice(0, Math.min(15, lines.length))
        .find(
          (ln) =>
            ln.length >= 3 &&
            /[A-Za-zÆØÅæøå]/.test(ln) &&
            !BAD_VENDOR.test(ln) &&
            !ADDRESSISH.test(ln) &&
            !isMostlyDigits(ln) &&
            !/^(faktura|invoice)\b/i.test(ln)
        );
    }
    if (candidate) out.vendor = candidate.replace(/\s{2,}/g, " ").trim();
  }

  // ---------------- TOTAL (handles duplicate tokens) ----------------
  let total: number | undefined;

  // A) Label on same line
  const labelRe =
    /(Total(?:t)?|Sum(?!\s*MVA)|Å\s*betale|Beløp\s*å\s*betale|Til\s*betaling|Amount\s*(?:Due|to\s*Pay)|Betales)\s*[:\-]?\s*([^\n\r]+)/iu;
  const mSame = t.match(labelRe);
  if (mSame?.[2]) total = pickOneFromChunk(mSame[2]);

  // B) Label on one line, number next line
  if (total === undefined) {
    for (let i = 0; i < lines.length - 1; i++) {
      if (labelRe.test(lines[i])) {
        const cand = lines[i + 1];
        total = pickOneFromChunk(cand);
        if (total !== undefined) break;
      }
    }
  }

  // C) Else: scan NOK/kr lines; ignore VAT/MVA lines; pick largest token
  if (total === undefined) {
    const amounts: number[] = [];
    for (const ln of lines) {
      if (/mva|moms|vat/i.test(ln)) continue;
      if (!/(?:NOK|kr)\b/i.test(ln)) continue;
      const nums = pickNumbersFromChunk(ln);
      amounts.push(...nums);
    }
    const pick = safePickLargest(amounts);
    if (pick !== undefined) total = pick;
  }

  if (total !== undefined) out.total = Math.round(total * 100) / 100;

  return out;
}
