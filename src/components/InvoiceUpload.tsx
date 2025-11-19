// src/lib/processInvoiceUpload.ts

import parseInvoice from "./invoiceParser";
import { saveDocumentLinesWithCo2, RawInvoiceLine } from "./saveDocumentLinesWithCo2";

export type ProcessInvoiceArgs = {
  supabase: any;               // Supabase server client
  orgId: string;               // organization / customer id
  invoiceText: string;         // full OCR text of the invoice
  lines: RawInvoiceLine[];     // parsed line items (description, quantity, unitRaw, amountNok)
};

export async function processInvoiceUpload({
  supabase,
  orgId,
  invoiceText,
  lines,
}: ProcessInvoiceArgs) {
  // 1) Parse the invoice header + activity hints + rough co2
  const parsed = await parseInvoice(invoiceText);

  // 2) Insert the document row
  // We ONLY insert fields we know are numeric or safe, to avoid type issues.
  const { data: docRows, error: docError } = await supabase
    .from("document")
    .insert([
      {
        org_id: orgId,

        // Keep it minimal for now to avoid type mismatches
        // If your document table has these numeric columns, this is safe:
        total_amount: parsed.total,       // numeric
        invoice_date: parsed.dateISO,     // date as string, Postgres can cast
        co2_kg: parsed.co2Kg,             // numeric
        energy_kwh: parsed.energyKwh,     // numeric
        fuel_liters: parsed.fuelLiters,   // numeric
        gas_m3: parsed.gasM3,             // numeric
      },
    ])
    .select("id")
    .single();

  if (docError) {
    console.error("Failed to insert document:", docError);
    throw docError;
  }

  const documentId = docRows.id as string;

  // 3) Save line items with automatic CO2 enrichment
  if (lines && lines.length > 0) {
    await saveDocumentLinesWithCo2(supabase, documentId, lines);
  }

  return {
    documentId,
    parsed,
  };
}
