// src/lib/finance.ts

export const SHADOW_PRICE_PER_TONN_NOK = 2000;

// ---------- formatting ----------
export function fmtNok(n: number, digits = 0) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: digits,
  }).format(Number.isFinite(n) ? n : 0);
}

export function fmtNumber(n: number, digits = 0) {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: digits,
  }).format(Number.isFinite(n) ? n : 0);
}

// ---------- ESG finance metrics ----------
export type FinanceMetrics = {
  totalSpendNok: number;
  totalCo2Kg: number;
  carbonIntensityPerNokGram: number; // g CO2 / NOK
  co2PerMillionNokTonnes: number; // tonn / MNOK
  carbonShadowCostNok: number; // NOK
};

function safeNum(x: any): number {
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : 0;
}

// Backwards compatible: accept rows with { amount_nok } OR { total }
export function calculateFinanceMetrics(
  rows: Array<{ amount_nok?: number | null; total?: number | null; total_co2_kg?: number | null }>
): FinanceMetrics {
  const totalSpendNok = rows.reduce((sum, r) => sum + safeNum(r.amount_nok ?? r.total), 0);
  const totalCo2Kg = rows.reduce((sum, r) => sum + safeNum(r.total_co2_kg), 0);

  const carbonIntensityPerNokGram = totalSpendNok > 0 ? (totalCo2Kg * 1000) / totalSpendNok : 0;
  const co2PerMillionNokTonnes = totalSpendNok > 0 ? (totalCo2Kg / 1000) / (totalSpendNok / 1_000_000) : 0;
  const carbonShadowCostNok = (totalCo2Kg / 1000) * SHADOW_PRICE_PER_TONN_NOK;

  return {
    totalSpendNok,
    totalCo2Kg,
    carbonIntensityPerNokGram,
    co2PerMillionNokTonnes,
    carbonShadowCostNok,
  };
}

// ---------- Project / measures metrics ----------
export type ProjectInput = {
  capex_nok: number;
  opex_annual_nok: number;
  expected_reduction_rate: number; // 0.1 = 10%
  lifetime_years: number;
  discount_rate: number;
  carbon_price_per_ton_nok: number;

  // baseline window (period sums)
  baseline_months: number;
  baseline_spend_period_nok: number;
  baseline_co2_period_kg: number;
  baseline_quantity_period: number | null;
  baseline_unit: string | null;

  // optional manual override (audit)
  use_override: boolean;
  override_annual_cost_saving_nok: number | null;
  override_annual_co2_saving_kg: number | null;
};

export type ProjectMetrics = {
  baselineSource: "invoice_lines" | "invoices";

  baselineSpendAnnualNok: number;
  baselineCo2AnnualKg: number;
  baselineQuantityAnnual: number | null;
  baselineUnit: string | null;

  annualCostSavingNok: number;
  annualCo2SavingKg: number;
  annualShadowSavingNok: number;
  annualNetBenefitNok: number;

  npvNok: number;
  paybackYears: number | null;
};

export function calculateProjectMetrics(
  baselineSource: "invoice_lines" | "invoices",
  p: ProjectInput
): ProjectMetrics {
  const months = Math.max(1, Math.min(60, Math.round(p.baseline_months || 12)));

  // Annualize baseline
  const baselineSpendAnnualNok = (safeNum(p.baseline_spend_period_nok) / months) * 12;
  const baselineCo2AnnualKg = (safeNum(p.baseline_co2_period_kg) / months) * 12;

  const baselineQuantityAnnual =
    p.baseline_quantity_period != null ? (safeNum(p.baseline_quantity_period) / months) * 12 : null;

  const reduction = Math.max(0, Math.min(1, safeNum(p.expected_reduction_rate)));

  // Compute annual savings from baseline
  let annualCostSavingNok = baselineSpendAnnualNok * reduction;
  let annualCo2SavingKg = baselineCo2AnnualKg * reduction;

  // Optional override
  if (p.use_override) {
    if (p.override_annual_cost_saving_nok != null) annualCostSavingNok = safeNum(p.override_annual_cost_saving_nok);
    if (p.override_annual_co2_saving_kg != null) annualCo2SavingKg = safeNum(p.override_annual_co2_saving_kg);
  }

  const carbonPrice = safeNum(p.carbon_price_per_ton_nok);
  const annualShadowSavingNok = (annualCo2SavingKg / 1000) * carbonPrice;

  const opex = safeNum(p.opex_annual_nok);

  // Net benefit per year (positive = good)
  const annualNetBenefitNok = annualCostSavingNok + annualShadowSavingNok - opex;

  const capex = safeNum(p.capex_nok);
  const years = Math.max(1, Math.min(50, Math.round(p.lifetime_years || 5)));
  const r = Math.max(0, Math.min(1, safeNum(p.discount_rate)));

  // NPV
  let npv = -capex;
  for (let t = 1; t <= years; t++) {
    npv += annualNetBenefitNok / Math.pow(1 + r, t);
  }

  // Payback (undiscounted)
  let payback: number | null = null;
  if (annualNetBenefitNok > 0) {
    payback = capex / annualNetBenefitNok;
  }

  return {
    baselineSource,
    baselineSpendAnnualNok,
    baselineCo2AnnualKg,
    baselineQuantityAnnual,
    baselineUnit: p.baseline_unit ?? null,

    annualCostSavingNok,
    annualCo2SavingKg,
    annualShadowSavingNok,
    annualNetBenefitNok,

    npvNok: npv,
    paybackYears: payback,
  };
}
