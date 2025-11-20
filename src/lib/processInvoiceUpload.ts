// src/lib/processInvoiceUpload.ts

import parseInvoice from "./invoiceParser";
import saveDocumentLinesWithCo2 from "./saveDocumentLinesWithCo2";

export type ProcessInvoiceArgs = {
  supabase: any;        // Supabase client
  orgId: string;        // organization / customer id
  invoiceText: string;  // full OCR text
  // `lines` is no longer needed; we parse them from the text
};

export async function processInvoiceUpload({
  supabase,
  orgId,
  invoiceText,
}: ProcessInvoiceArgs) {
  // 1) Parse invoice (header + line items)
  const parsed = await parseInvoice(invoiceText);

  // 2) Insert document row
  const { data: docRows, error: docError } = await supabase
    .from("document")
    .insert([
      {
        org_id: orgId,
        total_amount: parsed.total ?? null,
        issue_date: parsed.dateISO ?? null,
        currency: parsed.currency ?? "NOK",
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

  // 3) Insert line items with CO2, if any
  if (parsed.lines && parsed.lines.length > 0) {
    await saveDocumentLinesWithCo2(supabase, documentId, parsed.lines);
  }

  return {
    documentId,
    parsed,
  };
}

export default processInvoiceUpload;
