// src/lib/saveDocumentLinesWithCo2.ts

import type { ParsedInvoiceLine } from "./invoiceParser";

export type RawInvoiceLine = ParsedInvoiceLine;

type EmissionFactorRow = {
  id: string;
  name: string;
  product_category_id: string | null;
  co2_per_unit_kg: number | null;   // <-- matches your table column
  source?: string | null;
};

function normalizeUnit(u: string | null): string | null {
  if (!u) return null;
  const x = u.toLowerCase();
  if (x === "l" || x.startsWith("liter") || x.startsWith("litre")) return "liter";
  if (x === "stk" || x === "st" || x === "pcs" || x === "pc") return "piece";
  if (x === "kg") return "kg";
  if (x === "m3" || x === "m³") return "m3";
  return x;
}

function pickFactor(factors: EmissionFactorRow[], description: string): EmissionFactorRow | null {
  const d = description.toLowerCase();

  const findBy = (keyword: string) =>
    factors.find(f => f.name.toLowerCase().includes(keyword));

  if (d.includes("diesel")) return findBy("diesel fuel") || findBy("diesel");
  if (d.includes("fuel")) return findBy("fuel") || findBy("diesel");
  if (d.includes("fries") || d.includes("pommes")) return findBy("frozen fries") || findBy("fries");
  if (d.includes("laptop") || d.includes("pc")) return findBy("laptop") || findBy("computer");
  if (d.includes("electricity") || d.includes("strøm") || d.includes("strom"))
    return findBy("electricity") || findBy("power");

  return null;
}

export async function saveDocumentLinesWithCo2(
  supabase: any,
  documentId: string,
  lines: RawInvoiceLine[]
): Promise<void> {
  if (!documentId) throw new Error("documentId is required");
  if (!lines || lines.length === 0) return;

  // Load emission factors once.
  // We only select columns that we know exist in your table.
  const { data: factors, error: factorsError } = await supabase
    .from("emission_factor")
    .select<EmissionFactorRow[]>("id, name, product_category_id, co2_per_unit_kg, source");

  if (factorsError) {
    console.error("Failed to fetch emission_factor rows:", factorsError);
    throw factorsError;
  }

  const rowsToInsert: any[] = [];

  for (const line of lines) {
    const unitNormalized = normalizeUnit(line.unitRaw ?? null);
    const quantity = line.quantity ?? null;

    let co2_kg: number | null = null;
    let co2_source: string | null = null;
    let product_category_id: string | null = null;
    let emission_factor_id: string | null = null;

    const ef = pickFactor(factors || [], line.description);

    if (ef && quantity != null && ef.co2_per_unit_kg != null) {
      co2_kg = quantity * ef.co2_per_unit_kg;
      co2_source = ef.source ?? `Generic factor: ${ef.name}`;
      product_category_id = ef.product_category_id;
      emission_factor_id = ef.id;
    }

    rowsToInsert.push({
      document_id: documentId,

      // basic invoice columns
      description: line.description,
      quantity,
      unit: unitNormalized ?? line.unitRaw ?? null,

      // normalized fields (your table may ignore extra columns if they don't exist)
      unit_raw: line.unitRaw ?? null,
      unit_normalized: unitNormalized,
      quantity_normalized: quantity,

      product_category_id,
      emission_factor_id,
      co2_kg,
      co2_source,
    });
  }

  const { error: insertError } = await supabase
    .from("document_line")
    .insert(rowsToInsert);

  if (insertError) {
    console.error("Failed to insert document_line rows:", insertError);
    throw insertError;
  }
}

export default saveDocumentLinesWithCo2;
