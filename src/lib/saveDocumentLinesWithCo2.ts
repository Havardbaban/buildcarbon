// src/lib/saveDocumentLinesWithCo2.ts

import { enrichLineWithCo2, LineInput } from "./classifyLineItem";

/**
 * Shape of a raw line coming from your invoice OCR/parser.
 * You can adjust these fields to match what you already have.
 */
export type RawInvoiceLine = {
  description: string | null;
  quantity: number | null;
  unitRaw?: string | null;   // e.g. "stk", "kg", "l"
  amountNok?: number | null; // line total in NOK (optional)
};

/**
 * Save multiple lines for one document into the `document_line` table,
 * automatically calculating CO2 and filling:
 * - unit_raw
 * - unit_normalized
 * - quantity_normalized
 * - product_category_id
 * - emission_factor_id
 * - co2_kg
 * - co2_source
 *
 * @param supabase - a Supabase client instance
 * @param documentId - the id of the parent document (FK to public.document.id)
 * @param lines - raw line items from your parser/OCR
 */
export async function saveDocumentLinesWithCo2(
  supabase: any,
  documentId: string,
  lines: RawInvoiceLine[]
) {
  if (!documentId) {
    throw new Error("documentId is required");
  }
  if (!lines || lines.length === 0) {
    return;
  }

  const toInsert: any[] = [];

  for (const line of lines) {
    const enriched = await enrichLineWithCo2(supabase, {
      description: line.description,
      quantity: line.quantity,
      unitRaw: line.unitRaw ?? null,
    } as LineInput);

    toInsert.push({
      document_id: documentId,
      description: line.description,
      quantity: line.quantity,
      amount: line.amountNok ?? null,

      // New CO2-related fields:
      unit_raw: enriched.unitRaw,
      unit_normalized: enriched.unitNormalized,
      quantity_normalized: enriched.quantityNormalized,
      product_category_id: enriched.productCategoryId,
      emission_factor_id: enriched.emissionFactorId,
      co2_kg: enriched.co2Kg,
      co2_source: enriched.co2Source,
    });
  }

  const { error } = await supabase.from("document_line").insert(toInsert);

  if (error) {
    console.error("Failed to insert document_line rows with CO2:", error);
    throw error;
  }
}
