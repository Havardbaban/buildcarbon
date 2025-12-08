// src/lib/externalOcr.ts
// Kaller Mindee Invoice API og mapper til ParsedInvoice.

import type { ParsedInvoice, ParsedInvoiceLine } from "./invoiceParser";

// Mindee Invoice v4 endpoint
// ref: https://api.mindee.net/v1/products/mindee/invoices/v4/predict
const MINDEE_INVOICE_ENDPOINT =
  "https://api.mindee.net/v1/products/mindee/invoices/v4/predict";

type MindeePrediction = any; // for enkelhet, vi plukker bare ut feltene vi trenger

export async function runExternalOcr(
  file: File,
  onStatus?: (msg: string) => void
): Promise<ParsedInvoice> {
  const apiKey = import.meta.env.VITE_MINDEE_API_KEY as string | undefined;

  if (!apiKey) {
    throw new Error(
      "Mangler VITE_MINDEE_API_KEY. Legg den inn i .env og i Vercel Environment."
    );
  }

  onStatus?.("Sender faktura til Mindee Invoice API...");

  const formData = new FormData();
  // Viktig: Mindee forventer felt-navn 'document'
  formData.append("document", file);

  const res = await fetch(MINDEE_INVOICE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      Accept: "application/json",
    },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Mindee svarte med HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    document?: { inference?: { prediction?: MindeePrediction } };
  };

  const prediction = json.document?.inference?.prediction ?? {};

  // ---- Hent ut felt fra Mindee-responsen ----
  const supplierName =
    prediction.supplier_name?.value ??
    prediction.supplier?.value ??
    prediction.supplier ??
    null;

  const supplierRegs = prediction.supplier_company_registrations ?? [];
  const supplierOrg =
    supplierRegs[0]?.value ??
    supplierRegs[0]?.company_registration_number ??
    null;

  const invoiceNumber =
    prediction.invoice_number?.value ??
    prediction.invoice_number ??
    null;

  const dateISO =
    prediction.date?.value ??
    prediction.invoice_date?.value ??
    prediction.date ??
    null;

  const totalRaw =
    prediction.total_incl?.value ??
    prediction.total_amount?.value ??
    prediction.total_incl ??
    prediction.total_amount ??
    null;

  const currencyRaw =
    prediction.locale?.currency ??
    prediction.currency?.value ??
    prediction.currency ??
    "NOK";

  const lineItems =
    prediction.line_items ??
    prediction.items ??
    [];

  const lines: ParsedInvoiceLine[] = (lineItems as any[]).map((item) => ({
    description:
      item.description?.value ??
      item.description ??
      "",
    quantity:
      item.quantity?.value ??
      item.quantity ??
      null,
    // Mindee har ofte 'unit_price' men ikke eksplisitt enhet,
    // så vi lar unitRaw være null enn så lenge.
    unitRaw: item.unit?.value ?? item.unit ?? null,
    amountNok:
      item.total_amount?.value ??
      item.total_amount ??
      null,
  }));

  const total =
    typeof totalRaw === "number"
      ? totalRaw
      : totalRaw != null
      ? Number(totalRaw)
      : null;

  const currency =
    typeof currencyRaw === "string"
      ? currencyRaw.toUpperCase()
      : "NOK";

  const parsed: ParsedInvoice = {
    vendor: supplierName ?? null,
    invoiceNumber: invoiceNumber ?? null,
    dateISO: dateISO ?? null,
    total: Number.isFinite(total as number) ? (total as number) : null,
    currency,
    orgNumber: supplierOrg ?? null,
    energyKwh: null,
    fuelLiters: null,
    gasM3: null,
    co2Kg: null,
    lines,
  };

  return parsed;
}
