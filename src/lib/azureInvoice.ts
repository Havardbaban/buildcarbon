// src/lib/azureInvoice.ts

const AZURE_ENDPOINT = import.meta.env.VITE_AZURE_OCR_ENDPOINT as string | undefined;
const AZURE_KEY = import.meta.env.VITE_AZURE_OCR_KEY1 as string | undefined;

export type ParsedInvoice = {
  supplierName: string;
  customerName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  totalAmountNok: number;
  currency: string;
  co2KgEstimate: number;
  scope: "Scope 1" | "Scope 2" | "Scope 3" | "Unknown";
  raw: any;
};

export async function analyzeInvoiceWithAzure(file: File): Promise<ParsedInvoice> {
  if (!AZURE_ENDPOINT || !AZURE_KEY) {
    throw new Error("Azure OCR is not configured. Missing endpoint or key.");
  }

  // remove trailing slashes
  const endpoint = AZURE_ENDPOINT.replace(/\/+$/, "");

  // Official stable prebuilt-invoice endpoint
  const analyzeUrl =
    `${endpoint}/formrecognizer/documentModels/prebuilt-invoice:analyze?api-version=2023-07-31`;

  // 1) Start analysis
  const startRes = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/pdf",
      "Ocp-Apim-Subscription-Key": AZURE_KEY,
    },
    body: file,
  });

  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error(
      `Azure analyze start failed (${startRes.status}): ${text}`
    );
  }

  const operationLocation = startRes.headers.get("operation-location");
  if (!operationLocation) {
    throw new Error("Azure response missing operation-location header.");
  }

  // 2) Poll for result
  const maxAttempts = 30;
  const delayMs = 2000;
  let resultJson: any | null = null;

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(delayMs);

    const pollRes = await fetch(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": AZURE_KEY },
    });

    if (!pollRes.ok) {
      const text = await pollRes.text();
      throw new Error(
        `Azure analyze poll failed (${pollRes.status}): ${text}`
      );
    }

    const json = await pollRes.json();

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Mapping & CO₂ estimate ---------------------------------------

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

  let totalAmount = 0;
  let currency = "NOK";

  const curObj =
    fields.AmountDue?.valueCurrency ??
    fields.Total?.valueCurrency ??
    fields.SubTotal?.valueCurrency ??
    null;

  if (curObj) {
    if (typeof curObj.amount === "number") totalAmount = curObj.amount;
    if (typeof curObj.currencyCode === "string")
      currency = curObj.currencyCode;
  }

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

function estimateCo2FromAmount(amountNok: number, text: string): number {
  if (!amountNok || Number.isNaN(amountNok)) return 0;

  let factorPerNok = 0.0002;

  if (/flight|fly|norwegian|sas|reise|tur|ryanair|wizz/i.test(text)) {
    factorPerNok = 0.0006;
  } else if (/diesel|bensin|fuel|gas|drivstoff/i.test(text)) {
    factorPerNok = 0.0005;
  } else if (
    /strøm|strom|electric|energi|elvia|power|varme|fjernvarme/i.test(text)
  ) {
    factorPerNok = 0.0003;
  } else if (/hotel|restaurant|catering|overnatting/i.test(text)) {
    factorPerNok = 0.00035;
  }

  const co2 = amountNok * factorPerNok;
  return Math.round(co2 * 10) / 10;
}
