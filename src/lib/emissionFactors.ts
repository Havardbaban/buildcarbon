// src/lib/emissionFactors.ts

// Basic types
export type InvoiceCategory =
  | "energy"
  | "fuel"
  | "travel"
  | "hotel"
  | "goods"
  | "services"
  | "other";

export type EmissionScope = "Scope 1" | "Scope 2" | "Scope 3";

export type EmissionInput = {
  amountNok: number;
  category: InvoiceCategory;
};

// Generic fallback factor (kg CO2e per NOK)
const NOK_FALLBACK_FACTOR = 0.0002;

// Category-specific emission factors (kg CO2e per NOK)
// These are simplified and can be tuned later.
const CATEGORY_FACTORS: Record<InvoiceCategory, number> = {
  energy: 0.00015,   // electricity / heating
  fuel: 0.00035,     // diesel / petrol
  travel: 0.00030,   // flights, taxis, etc
  hotel: 0.00025,
  goods: 0.00020,
  services: 0.00010,
  other: NOK_FALLBACK_FACTOR,
};

// Heuristic category detection from vendor name + OCR text
export function inferCategory(vendor: string, text: string): InvoiceCategory {
  const haystack = `${vendor} ${text}`.toLowerCase();

  if (haystack.match(/str[øo]m|electric|energi|elvia|h[aá]ndelskraft/)) {
    return "energy";
  }
  if (haystack.match(/diesel|bensin|fuel|circle k|statoil|shell/)) {
    return "fuel";
  }
  if (haystack.match(/fly|flight|sas|norwegian|wizz|taxi|uber|train|tog/)) {
    return "travel";
  }
  if (haystack.match(/hotel|hotell|airbnb|lodging/)) {
    return "hotel";
  }
  if (haystack.match(/utstyr|equipment|hardware|varer|goods/)) {
    return "goods";
  }
  if (haystack.match(/consult|konsulent|service|tjeneste/)) {
    return "services";
  }

  return "other";
}

// Map category to ESG scope
export function categoryToScope(category: InvoiceCategory): EmissionScope {
  switch (category) {
    case "fuel":
      return "Scope 1";
    case "energy":
      return "Scope 2";
    default:
      return "Scope 3";
  }
}

// Estimate emissions in kg CO2e from amount (NOK) + category
export function estimateEmissionsKg(input: EmissionInput): number {
  const factor = CATEGORY_FACTORS[input.category] ?? NOK_FALLBACK_FACTOR;
  const result = input.amountNok * factor;
  // round to 1 decimal
  return Math.round(result * 10) / 10;
}

// ESG E-score (0–100) based on CO2-intensity (kg/NOK)
export function calculateEsgEScore(
  totalCo2Kg: number,
  totalSpendNok: number
): number {
  if (!totalSpendNok || totalSpendNok <= 0) return 0;

  const intensity = totalCo2Kg / totalSpendNok; // kg per NOK

  // Simple scale: <= 0.00015 kg/NOK ~ 100, >= 0.001 kg/NOK ~ 0
  const worst = 0.001;
  const best = 0.00015;
  const clamped = Math.min(Math.max(intensity, best), worst);
  const score = ((worst - clamped) / (worst - best)) * 100;
  return Math.round(score);
}

// Alias for older code that expects this name
export const calculateESGScore = calculateEsgEScore;
