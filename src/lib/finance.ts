// src/lib/finance.ts

export type FinanceMetrics = {
  totalSpendNok: number;
  totalCo2Kg: number;
  carbonIntensityPerNok: number; // kg CO2 per NOK
  carbonIntensityPerNokGram: number; // g CO2 per NOK (for visning)
  co2PerMillionNokTonnes: number; // tonn CO2 per MNOK
  carbonShadowCostNok: number; // NOK, basert på intern karbonpris
};

// Du kan endre denne til hva dere vil bruke som intern karbonpris
// f.eks. 1000, 1500, 2000 NOK per tonn CO2e.
export const SHADOW_PRICE_PER_TONN_NOK = 2000;

type InvoiceLike = {
  total: number | null;
  total_co2_kg: number | null;
};

/**
 * Tar en liste med fakturaer og beregner finansielle + klimarelaterte nøkkeltall.
 */
export function calculateFinanceMetrics(invoices: InvoiceLike[]): FinanceMetrics {
  const totalSpendNok = invoices.reduce(
    (sum, inv) => sum + (inv.total ?? 0),
    0
  );

  const totalCo2Kg = invoices.reduce(
    (sum, inv) => sum + (inv.total_co2_kg ?? 0),
    0
  );

  const carbonIntensityPerNok =
    totalSpendNok > 0 ? totalCo2Kg / totalSpendNok : 0;

  const carbonIntensityPerNokGram = carbonIntensityPerNok * 1000; // g/NOK

  const totalCo2Tonnes = totalCo2Kg / 1000;

  const co2PerMillionNokTonnes =
    totalSpendNok > 0
      ? totalCo2Tonnes / (totalSpendNok / 1_000_000)
      : 0;

  const carbonShadowCostNok =
    totalCo2Tonnes * SHADOW_PRICE_PER_TONN_NOK;

  return {
    totalSpendNok,
    totalCo2Kg,
    carbonIntensityPerNok,
    carbonIntensityPerNokGram,
    co2PerMillionNokTonnes,
    carbonShadowCostNok,
  };
}
