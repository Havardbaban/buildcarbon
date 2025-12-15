// src/lib/processInvoiceUpload.ts
import { runExternalOcr } from "./externalOcr";
import parseInvoice from "./invoiceParser";
import saveDocumentLinesWithCo2 from "./saveDocumentLinesWithCo2";
import { estimateInvoiceEmissionsKg } from "./estimateEmissions";

// Hvis du har parseInvoiceLines.ts (du har den i repo), prøver vi å bruke den.
// Hvis ikke, faller vi tilbake uten å kræsje.
let parseInvoiceLinesSafe: ((raw: any) => any[]) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("./parseInvoiceLines");
  parseInvoiceLinesSafe = mod?.parseInvoiceLines ?? null;
} catch {
  parseInvoiceLinesSafe = null;
}

export type ProcessInvoiceArgs = {
  file: File;
  publicUrl?: string | null;
};

export type ProcessInvoiceResult = {
  invoiceId: string;
  vendor: string | null;
  amountNok: number;
  totalCo2Kg: number;
  linesCount: number;
};

function safeNum(x: any): number {
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : 0;
}

export default async function processInvoiceUpload(args: ProcessInvoiceArgs): Promise<ProcessInvoiceResult> {
  // 1) OCR via /api/azure-ocr -> Azure DI
  const ocr = await runExternalOcr(args.file);
  if (!ocr.ok) {
    throw new Error(ocr.message || "OCR failed");
  }

  const raw = ocr.raw;

  // 2) Parse invoice header totals/vendor/etc (din eksisterende parser)
  const parsed = parseInvoice(raw);

  const vendor = parsed?.vendor ?? parsed?.supplier ?? null;

  // VIKTIG: dere bruker amount_nok i DB og i ESG
  const amountNok = safeNum(
    parsed?.amount_nok ??
      parsed?.amountNok ??
      parsed?.total ??
      parsed?.invoiceTotal ??
      0
  );

  // 3) Parse lines (qty/unit/category) hvis mulig
  const lines = parseInvoiceLinesSafe ? parseInvoiceLinesSafe(raw) : (parsed?.lines ?? []);

  // 4) CO2 (bruker deres estimator)
  const totalCo2Kg = safeNum(
    parsed?.total_co2_kg ?? parsed?.totalCo2Kg ?? estimateInvoiceEmissionsKg({ amountNok, vendor: vendor ?? "", lines })
  );

  // 5) Save invoice + lines
  const saved = await saveDocumentLinesWithCo2({
    vendor,
    invoice_no: parsed?.invoice_no ?? parsed?.invoiceNo ?? null,
    invoice_date: parsed?.invoice_date ?? parsed?.invoiceDate ?? null,
    currency: parsed?.currency ?? "NOK",
    amount_nok: amountNok,
    total_co2_kg: totalCo2Kg,
    public_url: args.publicUrl ?? null,
    status: "ok",
    scope: "Scope 3",
    lines: Array.isArray(lines) ? lines : [],
  });

  return {
    invoiceId: saved.invoiceId,
    vendor,
    amountNok,
    totalCo2Kg,
    linesCount: Array.isArray(lines) ? lines.length : 0,
  };
}
