// src/lib/classifyLineItem.ts
// Helper to classify a document line and calculate CO2 for it.

export type LineInput = {
  description: string | null;
  quantity: number | null;
  unitRaw?: string | null;
};

export type LineCo2Result = {
  unitRaw: string | null;
  unitNormalized: string | null;
  quantityNormalized: number | null;
  productCategoryId: string | null;
  emissionFactorId: string | null;
  co2Kg: number | null;
  co2Source: string | null;
};

// Keyword rules to map descriptions to product categories by name
const CATEGORY_RULES: { name: string; keywords: string[] }[] = [
  { name: "Diesel Fuel", keywords: ["diesel"] },
  { name: "Petrol Fuel", keywords: ["bensin", "petrol", "gasoline"] },
  { name: "Electricity", keywords: ["strøm", "strom", "electricity", "power", "kwh"] },
  { name: "Laptop Computer", keywords: ["laptop", "pc", "notebook", "macbook"] },
  { name: "Frozen Fries", keywords: ["fries", "frites", "pommes", "pommes frites"] },
];

function pickCategoryName(description: string | null | undefined): string | null {
  if (!description) return null;
  const text = description.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return rule.name;
    }
  }
  return null;
}

// Normalize raw unit strings to a small internal set
function normalizeUnit(unitRaw?: string | null): string | null {
  if (!unitRaw) return null;
  const u = unitRaw.trim().toLowerCase();

  if (["l", "liter", "litre", "ltr"].includes(u)) return "LITER";
  if (["kg", "kilogram"].includes(u)) return "KG";
  if (["g", "gram"].includes(u)) return "KG"; // we'll convert quantity below
  if (["stk", "st", "pcs", "piece", "pc"].includes(u)) return "PIECE";
  if (["kwh"].includes(u)) return "KWH";

  return null;
}

// Adjust quantity based on unit (e.g. grams -> kg)
function normalizeQuantity(
  quantity: number | null | undefined,
  unitNormalized: string | null,
  unitRaw?: string | null
): number | null {
  if (quantity == null) return null;
  if (!unitRaw) return quantity;

  const raw = unitRaw.trim().toLowerCase();

  // Convert grams to kg
  if (unitNormalized === "KG" && raw === "g") {
    return quantity / 1000;
  }

  return quantity;
}

// Convert normalized quantity into the unit used by the emission factor
function convertQuantityToFactorUnit(
  quantityNormalized: number,
  unitNormalized: string | null,
  factorUnit: string
): number | null {
  const target = factorUnit.toUpperCase();

  // If we don't know the line's unit, just hope it's already in factorUnit
  if (!unitNormalized || unitNormalized === target) {
    return quantityNormalized;
  }

  // Example: piece -> kg for Frozen Fries (assume 2.5 kg per bag)
  if (unitNormalized === "PIECE" && target === "KG") {
    const KG_PER_BAG = 2.5; // placeholder – can be moved to DB later
    return quantityNormalized * KG_PER_BAG;
  }

  // Add more conversions here later as needed
  return null;
}

/**
 * Enrich a single invoice/document line with:
 * - normalized units and quantity
 * - product category ID
 * - emission factor ID
 * - calculated CO2
 *
 * `supabase` is any Supabase client instance (server-side).
 */
export async function enrichLineWithCo2(
  supabase: any,
  line: LineInput
): Promise<LineCo2Result> {
  const unitRaw = line.unitRaw ?? null;
  const unitNormalized = normalizeUnit(unitRaw);
  const quantityNormalized = normalizeQuantity(line.quantity, unitNormalized, unitRaw);

  let productCategoryId: string | null = null;
  let emissionFactorId: string | null = null;
  let co2Kg: number | null = null;
  let co2Source: string | null = null;

  // 1) Figure out which product category name fits the description
  const categoryName = pickCategoryName(line.description || null);

  if (categoryName) {
    // 2) Look up the product_category row by name
    const { data: categories, error: catError } = await supabase
      .from("product_category")
      .select("id")
      .eq("name", categoryName)
      .limit(1);

    if (!catError && categories && categories.length > 0) {
      productCategoryId = categories[0].id as string;

      // 3) Look up an emission_factor for that category
      const { data: factors, error: factorError } = await supabase
        .from("emission_factor")
        .select("id, co2_per_unit_kg, unit")
        .eq("product_category_id", productCategoryId)
        .limit(1);

      if (!factorError && factors && factors.length > 0 && quantityNormalized != null) {
        const factor = factors[0] as {
          id: string;
          co2_per_unit_kg: number;
          unit: string;
        };

        const effectiveQuantity = convertQuantityToFactorUnit(
          quantityNormalized,
          unitNormalized,
          factor.unit
        );

        if (effectiveQuantity != null) {
          co2Kg = effectiveQuantity * Number(factor.co2_per_unit_kg);
          emissionFactorId = factor.id;
          co2Source = "default_db";
        }
      }
    }
  }

  return {
    unitRaw,
    unitNormalized,
    quantityNormalized,
    productCategoryId,
    emissionFactorId,
    co2Kg,
    co2Source,
  };
}
