// src/lib/processInvoiceUpload.ts

import parseInvoice from "./invoiceParser";

export type RawInvoiceLine = {
  description: string | null;
  quantity: number | null;
  unitRaw?: string | null;
  amountNok?: number | null;
};

export type ProcessInvoiceArgs = {
  supabase: any;          // Supabase server client (passed in)
  orgId: string;          // organization / customer id
  invoiceText: string;    // full OCR text of the invoice
  lines?: RawInvoiceLine[]; // kept for later, NOT used now
};

export async function processInvoiceUpload({
  supabase,
  orgId,
  invoiceText,
}: ProcessInvoiceArgs) {
  // 1) Parse the invoice text locally (no DB involved here)
  const parsed = await parseInvoice(invoiceText);

  // 2) Insert ONLY one row into the `document` table.
  //    We NEVER send the raw invoice text to any numeric column.
  const { data: docRows, error: docError } = await supabase
    .from("document")
    .insert([
      {
        org_id: orgId,
        total_amount: parsed.total ?? null,       // numeric
        invoice_date: parsed.dateISO ?? null,     // date (string, Postgres casts)
        co2_kg: parsed.co2Kg ?? null,             // numeric
        energy_kwh: parsed.energyKwh ?? null,     // numeric
        fuel_liters: parsed.fuelLiters ?? null,   // numeric
        gas_m3: parsed.gasM3 ?? null,             // numeric
      },
    ])
    .select("id")
    .single();

  if (docError) {
    console.error("Failed to insert document:", docError);
    throw docError;
  }

  const documentId = docRows.id as string;

  // 3) IMPORTANT: we do NOT insert any `document_line` rows here yet.
  //    That part will come later after the schema is cleaned up.

  return {
    documentId,
    parsed,
  };
}

// Also export as default so both import styles work:
// import { processInvoiceUpload } ... OR import processInvoiceUpload ...
export default processInvoiceUpload;
