// src/lib/invoiceParser.ts

export type ParsedInvoice = {
  vendor?: string;
  invoiceNumber?: string;
  dateISO?: string;
  total?: number;
  currency?: string;
  orgNumber?: string;
};

function normalizeText(raw: string) {
  return raw.replace(/\r/g, "").replace(/\u00A0/g, " ");
}

/* ----------------------- Number helpers ----------------------- */

function parseScandiNumberToken(s: string): number | undefined {
  let x = s.trim();
  if (!x) return undefined;
  x = x.replace(/\s+/g, "");
  const lastComma = x.lastIndexOf(",");
  const lastDot = x.lastIndexOf(".");
  if (lastComma > lastDot) x = x.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma) x = x.replace(/,/g, "");
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function tokensToNumbers(chunk: string): number[] {
  const tokens = chunk.match(/[\d][\d\s.,]*/g) || [];
  const nums = tokens
    .map((tok) => parseScandiNumberToken(tok))
    .filter((n): n is number => typeof n === "number" && isFinite(n) && n > 0);
  return Array.from(new Set(nums)); // de-dupe
}

function lastTokenNumber(chunk: string): number | undefined {
  const nums = tokensToNumbers(chunk);
  if (!nums.length) return undefined;
  return nums[nums.length - 1];
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

/* --------------------------- Parser --------------------------- */

export default async function parseInvoice(text: string) {
  const out: ParsedInvoice = {};
  const t = normalizeText(text);
  const lines = t.split("\n").map((s) => s.trim()).filter(Boolean);

  // Currency
  out.currency = t.match(/\b(NOK|EUR|USD|SEK|DKK)\b/i)?.[1]?.toUpperCase() ?? "NOK";

  // Date -> ISO
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

  /* ------------------------- Vendor (good rule) ------------------------- */
  const BAD_VENDOR =
    /(faktura|invoice|fakturanr|fakturanummer|fakturadato|kid|iban|konto|account|ordre|referanse|ref\.)/i;
  const ADDRESSISH = /(vei|veien|gate|gt\.?|road|street|postboks|\b\d{4}\s+[A-Za-z])/i;

  const labeledVendor =
    t.match(/(?:Leverandør|Fra|From|Utsteder|Issuer|Selger)\s*[:\-]?\s*([^\n\r]+)/i)?.[1];
  if (
    labeledVendor &&
    !BAD_VENDOR.test(labeledVendor) &&
    !ADDRESSISH.test(labeledVendor) &&
    !isMostlyDigits(labeledVendor)
  ) {
    out.vendor = labeledVendor.replace(/\s{2,}/g, " ").trim();
  } else {
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
    if (!candidate) {
      candidate = lines
        .slice(0, 15)
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

  /* ------------------------- Total (label-first) ------------------------- */

  // Accent-tolerant label variants:
  // - Beløp å betale / Belop a betale
  // - Sum å betale / Sum a betale
  // - Sum inkl. mva / Inkl mva
  // - Til betaling / Amount due
  const LABELS: RegExp[] = [
    /bel[oø]p\s*[aå]\s*betale/i,
    /sum\s*[aå]\s*betale/i,
    /sum\s*(?:inkl\.?\s*mva|mva\s*inkl\.?)/i,
    /til\s*betaling/i,
    /amount\s*(?:due|to\s*pay)/i,
    /betal(?:es|ing)/i, // "Betales", "Betaling"
  ];

  // 1) Scan for labeled lines (prefer the LAST occurrence in the doc)
  let total: number | undefined;
  for (let i = lines.length - 1; i >= 0 && total === undefined; i--) {
    const ln = lines[i];
    if (LABELS.some((rx) => rx.test(ln))) {
      // number can be on same line or the very next line
      total = lastTokenNumber(ln);
      if (total === undefined && i + 1 < lines.length) {
        total = lastTokenNumber(lines[i + 1]);
      }
    }
  }

  // 2) If not found, use explicit NOK/kr lines (ignore MVA/VAT)
  if (total === undefined) {
    const amounts: number[] = [];
    for (const ln of lines) {
      if (/mva|moms|vat/i.test(ln)) continue;
      if (!/(?:NOK|kr)\b/i.test(ln)) continue;
      amounts.push(...tokensToNumbers(ln));
    }
    const pick = safePickLargest(amounts);
    if (pick !== undefined) total = pick;
  }

  // 3) Final fallback over ALL lines, but ignore phone/account/date/KID/IBAN rows
  if (total === undefined) {
    const amounts: number[] = [];
    const BAD_LINE =
      /(mva|moms|vat|kid|iban|bic|kontonummer|konto\s*nr|konto:|tlf|telefon|phone|ref\.)/i;
    const DATE_TOKEN = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;

    for (const ln of lines) {
      if (BAD_LINE.test(ln)) continue;
      const tokens = ln.match(/[\d][\d\s.,]*/g) || [];
      for (const tok of tokens) {
        const digitsOnly = tok.replace(/[^\d]/g, "");
        if (digitsOnly.length >= 11) continue; // skip long phone/account/KID
        if (DATE_TOKEN.test(tok.trim())) continue;
        const n = parseScandiNumberToken(tok);
        if (n && n > 0 && n < 1_000_000_000) amounts.push(n);
      }
    }
    const pick2 = safePickLargest(amounts);
    if (pick2 !== undefined) total = pick2;
  }

  if (total !== undefined) out.total = Math.round(total * 100) / 100;

  return out;
}
