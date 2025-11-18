// src/lib/processInvoiceUpload.ts

import parseInvoice from "./invoiceParser";
import { saveDocumentLinesWithCo2, RawInvoiceLine } from "./saveDocumentLinesWithCo2";

/**
 * This function ties everything together:
 * - parses invoice text (header + activity hints + co2Kg)
 * - creates a row in public.document
 * - stores line items in public.document_line with CO2 fields filled
 *
 * You call this from your API route / upload handler.
 */

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
  // ⚠️ ADJUST THIS to match your actual "document" table columns
  const { data: docRows, error: docError } = await supabase
    .from("document")
    .insert([
      {
        org_id: orgId,
        vendor: parsed.vendor,
        invoice_number: parsed.invoiceNumber,
        invoice_date: parsed.dateISO,
        total_amount: parsed.total,
        currency: parsed.currency,
        supplier_org_number: parsed.orgNumber,

        // Optional activity & CO2 hints
        energy_kwh: parsed.energyKwh,
        fuel_liters: parsed.fuelLiters,
        gas_m3: parsed.gasM3,
        co2_kg: parsed.co2Kg,
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
