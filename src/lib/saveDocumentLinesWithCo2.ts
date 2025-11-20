// src/lib/saveDocumentLinesWithCo2.ts

import { enrichLineWithCo2, LineInput } from "./classifyLineItem";

export type RawInvoiceLine = {
  description: string | null;
  quantity: number | null;
  unitRaw?: string | null;   // e.g. "stk", "kg", "l"
  amountNok?: number | null; // NOT used yet – keeping for future
};

/**
 * Save multiple lines for one document into the `document_line` table,
 * automatically calculating CO2 and filling ONLY the columns we know
 * match the schema safely.
 *
 * We intentionally do NOT touch legacy numeric columns like `quantity`,
 * `net_amount`, `vat_amount` until we’ve confirmed their types.
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

      // keep description only, avoid touching any numeric legacy cols:
      description: line.description,

      // NEW CO2-related fields (these match the columns we added):
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
