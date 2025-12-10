// src/lib/emissions.ts
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

const NOK_FALLBACK_FACTOR = 0.0002; // kg CO2e per NOK as generic fallback

const CATEGORY_FACTORS: Record<InvoiceCategory, number> = {
  // very rough typical values – can be tuned later
  energy: 0.00015,   // kg CO2e per NOK (electricity / heating)
  fuel: 0.00035,     // kg CO2e per NOK (diesel / petrol)
  travel: 0.00030,   // flights, taxis, etc
  hotel: 0.00025,
  goods: 0.00020,
  services: 0.00010,
  other: NOK_FALLBACK_FACTOR,
};

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

export function estimateEmissionsKg(input: EmissionInput): number {
  const factor = CATEGORY_FACTORS[input.category] ?? NOK_FALLBACK_FACTOR;
  const result = input.amountNok * factor;
  // round to 1 decimal
  return Math.round(result * 10) / 10;
}

// Simple ESG E-score from 0–100 based on average kg CO2e per NOK
export function calculateEsgEScore(
  totalCo2Kg: number,
  totalSpendNok: number
): number {
  if (!totalSpendNok || totalSpendNok <= 0) return 0;

  const intensity = totalCo2Kg / totalSpendNok; // kg per NOK

  // Very simple scale – tune later:
  // <= 0.00015 kg/NOK ~ 100, >= 0.001 kg/NOK ~ 0
  const worst = 0.001;
  const best = 0.00015;
  const clamped = Math.min(Math.max(intensity, best), worst);
  const score = ((worst - clamped) / (worst - best)) * 100;
  return Math.round(score);
}
