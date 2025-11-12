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
  if (lastComma > lastDot) {
    x = x.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    x = x.replace(/,/g, "");
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function looksLikePhone(token: string): boolean {
  const raw = token.trim();
  if (/[.,]\d{1,2}$/.test(raw)) return false;
  if (/^(\d{2}[\s-]?){3,5}\d{2}$/.test(raw)) return true;
  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly.length === 8 && /^(\d{2}){4}$/.test(digitsOnly)) return true;
  return false;
}

function tokensToNumbers(chunk: string): number[] {
  const tokens = chunk.match(/[\d][\d\s.,]*/g) || [];
  const nums = tokens
    .filter((tok) => !looksLikePhone(tok))
    .map((tok) => parseScandiNumberToken(tok))
    .filter((n): n is number => typeof n === "number" && isFinite(n) && n > 0);
  return Array.from(new Set(nums));
}

function lastTokenNumber(chunk: string): number | undefined {
  const tokens = chunk.match(/[\d][\d\s.,]*/g) || [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    if (looksLikePhone(tok)) continue;
    const n = parseScandiNumberToken(tok);
    if (typeof n === "number" && isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function plausibleAmount(n: number) {
  if (!Number.isFinite(n) || n <= 0) return false;
  if (n >= 50) return true;
  return Math.abs(n - Math.round(n)) > 1e-9;
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

  /* ------------------------- Vendor ------------------------- */
  const BAD_VENDOR =
    /(faktura|invoice|fakturanr|fakturanummer|fakturadato|kid|iban|konto|account|ordre|referanse|ref\.)/i;
  const ADDRESSISH = /(vei|veien|gate|gt\.?|road|street|postboks|\b\d{4}\s+[A-Za-z])/i;

  const labeledVendor =
    t.match(/(?:Leverandør|Fra|From|Utsteder|Issuer|Selger)\s*[:\-]?\s*([^\n\r]+)/i)?.[1];
  if (
    labeledVendor &&
    !BAD_VENDOR.test(labeledVendor) &&
    !ADDRESSISH.test(labeledVendor) &&
    !/^[\d\s.,-]+$/.test(labeledVendor)
  ) {
    out.vendor = labeledVendor.replace(/\s{2,}/g, " ").trim();
  } else {
    let candidate: string | undefined;
    const linesTop = lines.slice(0, 15);
    candidate = linesTop.find(
      (ln) =>
        ln.length >= 3 &&
        /[A-Za-zÆØÅæøå]/.test(ln) &&
        !BAD_VENDOR.test(ln) &&
        !ADDRESSISH.test(ln) &&
        !/^(faktura|invoice)\b/i.test(ln)
    );
    if (candidate) out.vendor = candidate.replace(/\s{2,}/g, " ").trim();
  }

  /* ------------------------- Total (robust, OCR-tolerant) ------------------------- */

  // OCR-tolerant patterns:
  //  - Beløp å betale  ≈  Belop a betale  ≈  Belgp & betale  ≈  Bel0p å betale
  const PAYABLE_FUZZY = /bel(?:[øo0]|lg)p\s*[^a-z0-9]{0,3}\s*(?:[aå@&])\s*betale/i;
  const SUM_INCL_MVA  = /sum\s*inkl\.?\s*mva/i;

  const BAD_PAGE = /(side\s*\d+\s*(?:av|of)\s*\d+)/i;
  const BAD_LINE =
    /(kid|iban|bic|kontonummer|konto\s*nr|konto:|tlf|telefon|phone|ref\.)/i; // VAT handled separately
  const DATE_TOKEN = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;

  let total: number | undefined;

  // 1) "Beløp å betale" (fuzzy) — same line or next line
  for (let i = lines.length - 1; i >= 0 && total === undefined; i--) {
    const ln = lines[i];
    if (PAYABLE_FUZZY.test(ln)) {
      if (!BAD_PAGE.test(ln)) {
        const n1 = lastTokenNumber(ln);
        if (typeof n1 === "number" && plausibleAmount(n1)) {
          total = n1; break;
        }
      }
      if (i + 1 < lines.length) {
        const ln2 = lines[i + 1];
        if (!BAD_PAGE.test(ln2) && !/^\s*\d{1,2}\s*$/.test(ln2)) {
          const n2 = lastTokenNumber(ln2);
          if (typeof n2 === "number" && plausibleAmount(n2)) {
            total = n2; break;
          }
        }
      }
    }
  }

  // 2) "Sum inkl.mva" — amount may be on same or next line (often two numbers; pick the last)
  if (total === undefined) {
    for (let i = 0; i < lines.length; i++) {
      if (SUM_INCL_MVA.test(lines[i])) {
        // same line
        const n1 = lastTokenNumber(lines[i]);
        if (typeof n1 === "number" && plausibleAmount(n1)) { total = n1; break; }
        // next line (choose last number)
        if (i + 1 < lines.length) {
          const nums = tokensToNumbers(lines[i + 1]);
          if (nums.length) {
            const cand = nums[nums.length - 1];
            if (plausibleAmount(cand)) { total = cand; break; }
          }
        }
      }
    }
  }

  // 3) NOK/kr lines (ignore MVA/moms/VAT lines)
  if (total === undefined) {
    for (const ln of lines) {
      if (/mva|moms|vat/i.test(ln)) continue;
      if (!/(?:NOK|kr)\b/i.test(ln)) continue;
      const nums = tokensToNumbers(ln);
      const cand = nums.length ? nums[nums.length - 1] : undefined;
      if (typeof cand === "number" && plausibleAmount(cand)) {
        total = cand; break;
      }
    }
  }

  // 4) Final guarded fallback: only lines with money-ish keywords; still ignore phone/IDs/dates/pages
  if (total === undefined) {
    const MONEYISH = /(NOK|kr|sum|bel|betal|inkl\.?\s*mva)/i;
    for (const ln of lines) {
      if (BAD_LINE.test(ln) || BAD_PAGE.test(ln)) continue;
      if (!MONEYISH.test(ln)) continue;
      const tokens = ln.match(/[\d][\d\s.,]*/g) || [];
      for (const tok of tokens) {
        if (looksLikePhone(tok)) continue;
        const digitsOnly = tok.replace(/[^\d]/g, "");
        if (digitsOnly.length >= 11) continue;         // KID/IBAN/accounts
        if (DATE_TOKEN.test(tok.trim())) continue;     // dates
        const n = parseScandiNumberToken(tok);
        if (typeof n === "number" && plausibleAmount(n)) {
          total = n; break;
        }
      }
      if (total !== undefined) break;
    }
  }

  if (typeof total === "number") {
    out.total = Math.round(total * 100) / 100;
  }

  return out;
}
