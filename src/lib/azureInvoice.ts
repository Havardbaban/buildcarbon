// src/lib/azureInvoice.ts
//
// Azure Document Intelligence (prebuilt-invoice) helper.
// Takes a File, calls Azure, and returns a parsed invoice
// including a simple CO₂ estimate.
//

const AZURE_ENDPOINT = import.meta.env.VITE_AZURE_OCR_ENDPOINT as string | undefined;
const AZURE_KEY = import.meta.env.VITE_AZURE_OCR_KEY1 as string | undefined;

export type ParsedInvoice = {
  supplierName: string;
  customerName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // "YYYY-MM-DD"
  dueDate: string | null;
  totalAmountNok: number;
  currency: string;
  co2KgEstimate: number;
  scope: "Scope 1" | "Scope 2" | "Scope 3" | "Unknown";
  raw: any; // full Azure JSON (for debugging if needed)
};

/**
 * Main entry: analyze a file with Azure prebuilt-invoice.
 */
export async function analyzeInvoiceWithAzure(file: File): Promise<ParsedInvoice> {
  if (!AZURE_ENDPOINT || !AZURE_KEY) {
    throw new Error("Azure OCR is not configured. Missing endpoint or key.");
  }

  const endpoint = AZURE_ENDPOINT.replace(/\/+$/, "");
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/prebuilt-invoice:analyze?_overload=analyzeDocument&api-version=2024-11-30`;

  const base64 = await fileToBase64Content(file);

  // 1) Start analysis
  const startRes = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": AZURE_KEY,
    },
    body: JSON.stringify({
      base64Source: base64,
    }),
  });

  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error(`Azure analyze start failed (${startRes.status}): ${text}`);
  }

  const operationLocation = startRes.headers.get("operation-location");
  if (!operationLocation) {
    throw new Error("Azure response missing Operation-Location header.");
  }

  // 2) Poll for result
  const maxAttempts = 30;
  const delayMs = 2000;

  let resultJson: any | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(delayMs);

    const res = await fetch(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": AZURE_KEY },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Azure analyze poll failed (${res.status}): ${text}`);
    }

    const json = await res.json();

    if (json.status === "succeeded") {
      resultJson = json;
      break;
    }

    if (json.status === "failed") {
      throw new Error("Azure analysis failed.");
    }
  }

  if (!resultJson) {
    throw new Error("Timed out waiting for Azure analysis.");
  }

  return mapAzureResultToParsedInvoice(resultJson);
}

// --- helpers -------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert File -> base64 *content* (no data: prefix).
 */
async function fileToBase64Content(file: File): Promise<string> {
  const arrayBuf = await file.arrayBuffer();
  // Browser btoa works on strings, so we convert manually.
  let binary = "";
  const bytes = new Uint8Array(arrayBuf);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Map Azure prebuilt-invoice JSON to our ParsedInvoice structure.
 * The JSON shape may evolve; everything is heavily defensive with
 * optional chaining to avoid crashes.
 */
function mapAzureResultToParsedInvoice(json: any): ParsedInvoice {
  const doc = json?.analyzeResult?.documents?.[0] ?? {};
  const fields = doc.fields ?? {};

  const vendorName =
    fields.VendorName?.valueString ??
    fields.SupplierName?.valueString ??
    fields.MerchantName?.valueString ??
    "";

  const customerName =
    fields.CustomerName?.valueString ??
    fields.BillTo?.valueObject?.properties?.Name?.valueString ??
    null;

  const invoiceNumber =
    fields.InvoiceId?.valueString ??
    fields.InvoiceNumber?.valueString ??
    fields.InvoiceNo?.valueString ??
    null;

  const invoiceDateStr =
    fields.InvoiceDate?.valueDate ??
    fields.TransactionDate?.valueDate ??
    fields.Date?.valueDate ??
    null;

  const dueDateStr = fields.DueDate?.valueDate ?? null;

  // Total amount (prefer AmountDue, fallback to Total or SubTotal)
  let totalAmount = 0;
  let currency = "NOK";

  const currencyCandidate =
    fields.AmountDue?.valueCurrency ??
    fields.Total?.valueCurrency ??
    fields.SubTotal?.valueCurrency ??
    null;

  if (currencyCandidate) {
    totalAmount =
      typeof currencyCandidate.amount === "number"
        ? currencyCandidate.amount
        : 0;
    if (typeof currencyCandidate.currencyCode === "string") {
      currency = currencyCandidate.currencyCode;
    }
  }

  // Fallback if we didn’t get currency object but maybe got numbers
  if (!totalAmount) {
    if (typeof fields.AmountDue?.valueNumber === "number") {
      totalAmount = fields.AmountDue.valueNumber;
    } else if (typeof fields.Total?.valueNumber === "number") {
      totalAmount = fields.Total.valueNumber;
    }
  }

  if (!totalAmount || Number.isNaN(totalAmount)) {
    totalAmount = 0;
  }

  // Collect some text for category heuristics
  const lineItemsField = fields.Items ?? fields.LineItems;
  const lineItemsArray = lineItemsField?.valueArray ?? [];
  const descriptions: string[] = [];

  for (const item of lineItemsArray) {
    const valueObj = item?.valueObject ?? item?.value ?? {};
    const itemFields = valueObj.fields ?? valueObj;

    const desc =
      itemFields?.Description?.valueString ??
      itemFields?.ItemDescription?.valueString ??
      itemFields?.ProductCode?.valueString ??
      null;

    if (typeof desc === "string" && desc.trim()) {
      descriptions.push(desc.trim());
    }
  }

  const combinedText = `${vendorName} | ${descriptions.join("; ")}`.toLowerCase();
  const co2KgEstimate = estimateCo2FromAmount(totalAmount, combinedText);

  // For now we treat everything as Scope 3 (purchased goods & services)
  const scope: ParsedInvoice["scope"] = "Scope 3";

  return {
    supplierName: vendorName || "Unknown vendor",
    customerName,
    invoiceNumber,
    invoiceDate: invoiceDateStr,
    dueDate: dueDateStr,
    totalAmountNok: totalAmount,
    currency,
    co2KgEstimate,
    scope,
    raw: json,
  };
}

/**
 * Very simple CO₂ estimation based on heuristic categories.
 * You can tune these factors later.
 */
function estimateCo2FromAmount(amountNok: number, text: string): number {
  if (!amountNok || Number.isNaN(amountNok)) return 0;

  let factorPerNok = 0.0002; // generic fallback

  if (
    /flight|fly|norwegian|sas|wizz|ryanair|reise|tur/i.test(text)
  ) {
    // Flights / travel
    factorPerNok = 0.0006;
  } else if (/diesel|bensin|fuel|gas|drivstoff/i.test(text)) {
    // Fuel
    factorPerNok = 0.0005;
  } else if (
    /strøm|strom|electric|energi|elvia|norsk hydro|power|varme|fjernvarme/i.test(
      text
    )
  ) {
    // Energy / electricity / heating
    factorPerNok = 0.0003;
  } else if (/hotel|restaurant|catering|overnatting/i.test(text)) {
    // Hospitality
    factorPerNok = 0.00035;
  }

  const co2 = amountNok * factorPerNok;
  // Round to 0.1 kg
  return Math.round(co2 * 10) / 10;
}
