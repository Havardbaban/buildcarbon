// src/lib/processInvoiceUpload.ts

import parseInvoice from "./invoiceParser";
// NOTE: we still import the type but we won't call saveDocumentLinesWithCo2 yet
import type { RawInvoiceLine } from "./saveDocumentLinesWithCo2";

export type ProcessInvoiceArgs = {
  supabase: any;               // Supabase server client
  orgId: string;               // organization / customer id
  invoiceText: string;         // full OCR text of the invoice
  lines: RawInvoiceLine[];     // parsed line items (NOT used yet)
};

export async function processInvoiceUpload({
  supabase,
  orgId,
  invoiceText,
  lines, // eslint will complain if unused, that's ok for now
}: ProcessInvoiceArgs) {
  // 1) Parse the invoice header + activity hints + rough co2
  const parsed = await parseInvoice(invoiceText);

  // 2) Insert ONLY the document row
  const { data: docRows, error: docError } = await supabase
    .from("document")
    .insert([
      {
        org_id: orgId,
        // keep this minimal and safe
        total_amount: parsed.total ?? null,
        invoice_date: parsed.dateISO ?? null,
        co2_kg: parsed.co2Kg ?? null,
        energy_kwh: parsed.energyKwh ?? null,
        fuel_liters: parsed.fuelLiters ?? null,
        gas_m3: parsed.gasM3 ?? null,
      },
    ])
    .select("id")
    .single();

  if (docError) {
    console.error("Failed to insert document:", docError);
    throw docError;
  }

  const documentId = docRows.id as string;

  // 3) 👇 TEMPORARILY DISABLED:
  // We do NOT insert any document_line rows here until we've proven
  // the document insert is clean and the numeric error is gone.
  //
  // if (lines && lines.length > 0) {
  //   await saveDocumentLinesWithCo2(supabase, documentId, lines);
  // }

  return {
    documentId,
    parsed,
  };
}
