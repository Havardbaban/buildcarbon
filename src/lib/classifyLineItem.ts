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
  category: string | null;
  esgScope: number | null;
};

// Keyword rules to map descriptions to product categories with ESG scope
const CATEGORY_RULES: {
  name: string;
  keywords: string[];
  category: string;
  esgScope: 1 | 2 | 3;
}[] = [
  // Scope 1: Direct emissions from owned/controlled sources
  { name: "Diesel Fuel", keywords: ["diesel"], category: "fuel_diesel", esgScope: 1 },
  { name: "Petrol Fuel", keywords: ["bensin", "petrol", "gasoline"], category: "fuel_petrol", esgScope: 1 },
  { name: "Natural Gas", keywords: ["natural gas", "gass", "naturgass"], category: "fuel_gas", esgScope: 1 },
  { name: "Company Vehicle", keywords: ["company car", "firmabil", "fleet"], category: "vehicle_owned", esgScope: 1 },

  // Scope 2: Indirect emissions from purchased energy
  { name: "Electricity", keywords: ["strøm", "strom", "electricity", "power", "kwh"], category: "electricity", esgScope: 2 },
  { name: "District Heating", keywords: ["fjernvarme", "district heat", "heating"], category: "heating", esgScope: 2 },
  { name: "District Cooling", keywords: ["fjernkjøling", "district cool", "cooling"], category: "cooling", esgScope: 2 },

  // Scope 3: Indirect emissions in value chain
  { name: "Flight Travel", keywords: ["flight", "fly", "airline", "airfare"], category: "travel_flight", esgScope: 3 },
  { name: "Train Travel", keywords: ["train", "tog", "railway", "rail"], category: "travel_train", esgScope: 3 },
  { name: "Taxi/Ride", keywords: ["taxi", "uber", "lyft", "drosje"], category: "travel_taxi", esgScope: 3 },
  { name: "Hotel Stay", keywords: ["hotel", "hotell", "accommodation"], category: "travel_hotel", esgScope: 3 },
  { name: "Waste Disposal", keywords: ["waste", "avfall", "garbage", "trash"], category: "waste", esgScope: 3 },
  { name: "Purchased Goods", keywords: ["purchase", "innkjøp", "material", "supplies"], category: "goods", esgScope: 3 },
  { name: "Laptop Computer", keywords: ["laptop", "pc", "notebook", "macbook"], category: "electronics", esgScope: 3 },
  { name: "Frozen Fries", keywords: ["fries", "frites", "pommes", "pommes frites"], category: "food", esgScope: 3 },
  { name: "Transportation", keywords: ["transport", "shipping", "delivery", "freight"], category: "transport", esgScope: 3 },
];

function pickCategoryInfo(description: string | null | undefined): {
  name: string;
  category: string;
  esgScope: 1 | 2 | 3;
} | null {
  if (!description) return null;
  const text = description.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return {
        name: rule.name,
        category: rule.category,
        esgScope: rule.esgScope,
      };
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
  let category: string | null = null;
  let esgScope: number | null = null;

  // 1) Figure out which product category info fits the description
  const categoryInfo = pickCategoryInfo(line.description || null);

  if (categoryInfo) {
    category = categoryInfo.category;
    esgScope = categoryInfo.esgScope;

    // 2) Look up the product_category row by name
    const { data: categories, error: catError } = await supabase
      .from("product_category")
      .select("id")
      .eq("name", categoryInfo.name)
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
    category,
    esgScope,
  };
}
