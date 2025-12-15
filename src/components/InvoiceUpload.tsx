// src/lib/processInvoiceUpload.ts
import { externalOcr } from "./externalOcr";
import { parseInvoiceLines } from "./parseInvoiceLines";
import { saveDocumentLinesWithCo2 } from "./saveDocumentLinesWithCo2";
import { estimateInvoiceEmissionsKg } from "./estimateEmissions";

function toNumber(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string") {
    const s = x.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickField(azure: any, name: string): any {
  // Azure prebuilt invoice often: documents[0].fields.<Name>.value
  return azure?.documents?.[0]?.fields?.[name];
}

function pickText(f: any): string | null {
  if (!f) return null;
  return (f?.value ?? f?.content ?? f?.text ?? null) as any;
}

function pickAmount(f: any): number | null {
  if (!f) return null;
  // could be { value: { amount: 123, currencySymbol: "kr" } }
  const v = f?.value?.amount ?? f?.value ?? f?.content ?? null;
  return toNumber(v);
}

export async function processInvoiceUpload(file: File, publicUrl?: string | null) {
  // 1) OCR
  const azure = await externalOcr(file);

  // 2) Parse invoice header fields
  const vendor =
    pickText(pickField(azure, "VendorName")) ??
    pickText(pickField(azure, "Vendor")) ??
    null;

  const invoiceNo =
    pickText(pickField(azure, "InvoiceId")) ??
    pickText(pickField(azure, "InvoiceNumber")) ??
    null;

  const invoiceDate =
    pickText(pickField(azure, "InvoiceDate")) ??
    pickText(pickField(azure, "Date")) ??
    null;

  const total =
    pickAmount(pickField(azure, "InvoiceTotal")) ??
    pickAmount(pickField(azure, "Total")) ??
    0;

  const currency =
    pickText(pickField(azure, "InvoiceTotal")) ??
    "NOK";

  // 3) Parse line items with qty/unit/price/category
  const lines = parseInvoiceLines(azure);

  // 4) Estimate CO2 (your current approach)
  const totalCo2Kg = estimateInvoiceEmissionsKg({
    amountNok: total,
    vendor: vendor ?? "",
    lines,
  });

  // 5) Save invoice + lines
  const saved = await saveDocumentLinesWithCo2({
    vendor,
    invoice_no: invoiceNo,
    invoice_date: invoiceDate,
    currency: "NOK",
    amount_nok: total ?? 0,
    total_co2_kg: totalCo2Kg,
    public_url: publicUrl ?? null,
    status: "ok",
    lines,
  });

  return {
    invoiceId: saved.invoiceId,
    vendor,
    invoiceNo,
    invoiceDate,
    amountNok: total ?? 0,
    totalCo2Kg,
    linesCount: lines.length,
  };
}
