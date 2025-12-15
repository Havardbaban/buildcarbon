// src/lib/finance.ts

// -----------------------------
// Constants
// -----------------------------
export const SHADOW_PRICE_PER_TONN_NOK = 2000;

// Standard scenarier (kan endres senere i UI)
export type SavingsScenario = {
  label: string;
  reductionRate: number; // 0.1 = 10%
};

export const DEFAULT_REDUCTION_SCENARIOS: SavingsScenario[] = [
  { label: "Lav (10%)", reductionRate: 0.1 },
  { label: "Middels (30%)", reductionRate: 0.3 },
  { label: "Høy (50%)", reductionRate: 0.5 },
];

export const DEFAULT_CARBON_PRICES_NOK_PER_TON: number[] = [2000, 5000, 10000];

// -----------------------------
// Types (Invoices + Lines)
// -----------------------------
export type InvoiceRow = {
  id: string;
  vendor: string | null;
  amount_nok: number | null;
  total_co2_kg: number | null;
  scope?: string | null;
  category?: string | null;
};

export type InvoiceLineRow = {
  invoice_id: string;
  category?: string | null;   // electricity/fuel/transport/waste
  quantity?: number | null;   // e.g. 1000
  unit?: string | null;       // kWh/L/km/kg
  unit_price?: number | null; // NOK per unit
  // optional for compatibility:
  line_total?: number | null;
  total?: number | null;
};

function normUnit(u?: string | null) {
  if (!u) return null;
  const s = u.trim().toLowerCase();
  if (s === "kwh") return "kWh";
  if (s === "l" || s === "liter" || s === "litre") return "L";
  if (s === "km" || s === "kilometer") return "km";
  if (s === "kg") return "kg";
  if (s === "t" || s === "tonn" || s === "ton") return "t";
  return u.trim();
}

function safeNum(n: any): number {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : 0;
}

export function fmtNok(n: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtNumber(n: number, digits = 0) {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: digits,
  }).format(n);
}

// -----------------------------
// ESG Finance Metrics (for ESG page)
// -----------------------------
export type FinanceMetrics = {
  totalSpendNok: number;
  totalCo2Kg: number;
  carbonIntensityPerNokGram: number; // g CO2 / NOK
  co2PerMillionNokTonnes: number; // tonn CO2 / MNOK
  carbonShadowCostNok: number; // NOK
};

export function calculateFinanceMetrics(
  rows: Array<{ total?: number | null; total_co2_kg?: number | null }>
): FinanceMetrics {
  const totalSpendNok = rows.reduce((sum, r) => sum + (r.total ?? 0), 0);
  const totalCo2Kg = rows.reduce((sum, r) => sum + (r.total_co2_kg ?? 0), 0);

  const carbonIntensityPerNokGram =
    totalSpendNok > 0 ? (totalCo2Kg * 1000) / totalSpendNok : 0;

  const co2PerMillionNokTonnes =
    totalSpendNok > 0 ? (totalCo2Kg / 1000) / (totalSpendNok / 1_000_000) : 0;

  const carbonShadowCostNok = (totalCo2Kg / 1000) * SHADOW_PRICE_PER_TONN_NOK;

  return {
    totalSpendNok,
    totalCo2Kg,
    carbonIntensityPerNokGram,
    co2PerMillionNokTonnes,
    carbonShadowCostNok,
  };
}

// -----------------------------
// Scenario: Shadow “Savings”
// -----------------------------
export type ShadowScenarioResult = {
  reductionLabel: string;
  reductionRate: number;
  carbonPricePerTonNok: number;
  co2ReducedKg: number;
  shadowSavingsNok: number; // avoided shadow cost
};

export function calculateShadowScenarioSavings(params: {
  totalCo2Kg: number;
  reductionScenarios?: SavingsScenario[];
  carbonPricesNokPerTon?: number[];
}): ShadowScenarioResult[] {
  const totalCo2Kg = params.totalCo2Kg ?? 0;
  const reductions = params.reductionScenarios ?? DEFAULT_REDUCTION_SCENARIOS;
  const prices = params.carbonPricesNokPerTon ?? DEFAULT_CARBON_PRICES_NOK_PER_TON;

  const out: ShadowScenarioResult[] = [];

  for (const r of reductions) {
    for (const p of prices) {
      const co2ReducedKg = totalCo2Kg * r.reductionRate;
      const shadowSavingsNok = (co2ReducedKg / 1000) * p;
      out.push({
        reductionLabel: r.label,
        reductionRate: r.reductionRate,
        carbonPricePerTonNok: p,
        co2ReducedKg,
        shadowSavingsNok,
      });
    }
  }

  // sort: highest NOK first
  out.sort((a, b) => b.shadowSavingsNok - a.shadowSavingsNok);
  return out;
}

// -----------------------------
// Real “Cost Savings” from invoice_lines
// -----------------------------
export type CategoryModel = {
  unit: "kWh" | "L" | "km" | "kg";
  emissionFactorKgCo2PerUnit: number; // coarse
  defaultReductionRate: number;
};

export const CATEGORY_MODELS: Record<string, CategoryModel> = {
  electricity: { unit: "kWh", emissionFactorKgCo2PerUnit: 0.10, defaultReductionRate: 0.15 },
  fuel: { unit: "L", emissionFactorKgCo2PerUnit: 2.60, defaultReductionRate: 0.10 },
  transport: { unit: "km", emissionFactorKgCo2PerUnit: 0.18, defaultReductionRate: 0.10 },
  waste: { unit: "kg", emissionFactorKgCo2PerUnit: 0.50, defaultReductionRate: 0.10 },
};

export type RealSavingsRow = {
  category: string;
  unit: string;
  baselineQuantity: number;
  baselineSpendNok: number;
  avgUnitPriceNok: number;
  assumedReductionRate: number;
  quantityReduced: number;
  costSavingsNok: number;    // “real” (spend) savings estimate
  co2SavingsKg: number;      // derived from quantity
  shadowSavingsNok: number;  // derived from co2Savings * carbon price
};

export function calculateRealSavingsFromLines(
  lines: InvoiceLineRow[],
  opts?: { overrideReductionRate?: number; carbonPricePerTonNok?: number }
): RealSavingsRow[] {
  const carbonPrice = opts?.carbonPricePerTonNok ?? SHADOW_PRICE_PER_TONN_NOK;

  const agg: Record<string, { qty: number; spend: number; unit: string; model: CategoryModel }> = {};

  for (const line of lines) {
    const category = (line.category ?? "").trim().toLowerCase();
    if (!category) continue;

    const model = CATEGORY_MODELS[category];
    if (!model) continue;

    const unit = normUnit(line.unit);
    if (unit !== model.unit) continue;

    const quantity = safeNum(line.quantity);
    if (quantity <= 0) continue;

    // spend: prefer explicit line_total/total; else quantity*unit_price
    const explicit =
      safeNum(line.line_total) || safeNum(line.total);

    const unitPrice = safeNum(line.unit_price);
    const spend = explicit > 0 ? explicit : (unitPrice > 0 ? quantity * unitPrice : 0);

    if (!agg[category]) agg[category] = { qty: 0, spend: 0, unit: model.unit, model };
    agg[category].qty += quantity;
    agg[category].spend += spend;
  }

  const out: RealSavingsRow[] = [];

  for (const [category, a] of Object.entries(agg)) {
    const baselineQuantity = a.qty;
    const baselineSpendNok = a.spend;
    const avgUnitPriceNok = baselineQuantity > 0 ? baselineSpendNok / baselineQuantity : 0;

    const assumedReductionRate =
      typeof opts?.overrideReductionRate === "number"
        ? opts.overrideReductionRate
        : a.model.defaultReductionRate;

    const quantityReduced = baselineQuantity * assumedReductionRate;
    const costSavingsNok = quantityReduced * avgUnitPriceNok;

    const co2SavingsKg = quantityReduced * a.model.emissionFactorKgCo2PerUnit;
    const shadowSavingsNok = (co2SavingsKg / 1000) * carbonPrice;

    out.push({
      category,
      unit: a.unit,
      baselineQuantity,
      baselineSpendNok,
      avgUnitPriceNok,
      assumedReductionRate,
      quantityReduced,
      costSavingsNok,
      co2SavingsKg,
      shadowSavingsNok,
    });
  }

  out.sort((a, b) => b.costSavingsNok - a.costSavingsNok);
  return out;
}

// -----------------------------
// Project ROI / Payback / NPV
// -----------------------------
export type ProjectInput = {
  capexNok: number;
  opexAnnualNok: number; // annual extra cost (positive) or saving (negative)
  annualCostSavingsNok: number; // positive savings
  annualCo2SavingsKg: number;   // positive savings
  carbonPricePerTonNok: number;
  lifetimeYears: number;
  discountRate: number; // 0.08
};

export type ProjectMetrics = {
  annualShadowSavingsNok: number;
  annualNetBenefitNok: number; // (cost savings + shadow savings) - opex
  paybackYears: number | null; // simple payback
  npvNok: number;
  irr: number | null;
};

export function npv(discountRate: number, cashflows: number[]): number {
  // cashflows[0] is today
  let total = 0;
  for (let t = 0; t < cashflows.length; t++) {
    total += cashflows[t] / Math.pow(1 + discountRate, t);
  }
  return total;
}

export function irr(cashflows: number[]): number | null {
  // Basic IRR via binary search on rate [-0.9, 1.0]
  // Returns null if no sign change.
  const hasPos = cashflows.some((x) => x > 0);
  const hasNeg = cashflows.some((x) => x < 0);
  if (!hasPos || !hasNeg) return null;

  let lo = -0.9;
  let hi = 1.0;

  const f = (r: number) => npv(r, cashflows);

  let flo = f(lo);
  let fhi = f(hi);
  // widen if needed
  for (let i = 0; i < 20 && flo * fhi > 0; i++) {
    hi += 1.0;
    fhi = f(hi);
  }
  if (flo * fhi > 0) return null;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (Math.abs(fmid) < 1e-6) return mid;
    if (flo * fmid <= 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

export function calculateProjectMetrics(input: ProjectInput): ProjectMetrics {
  const annualShadowSavingsNok =
    (input.annualCo2SavingsKg / 1000) * (input.carbonPricePerTonNok || SHADOW_PRICE_PER_TONN_NOK);

  const annualNetBenefitNok =
    (input.annualCostSavingsNok || 0) + annualShadowSavingsNok - (input.opexAnnualNok || 0);

  // simple payback: capex / annual net benefit
  const paybackYears =
    annualNetBenefitNok > 0 ? input.capexNok / annualNetBenefitNok : null;

  // cashflows: year0 = -capex, years1..N = annualNetBenefit
  const cashflows: number[] = [-Math.max(0, input.capexNok)];
  for (let y = 1; y <= Math.max(1, input.lifetimeYears); y++) {
    cashflows.push(annualNetBenefitNok);
  }

  const npvNok = npv(input.discountRate || 0.08, cashflows);
  const irrVal = irr(cashflows);

  return {
    annualShadowSavingsNok,
    annualNetBenefitNok,
    paybackYears,
    npvNok,
    irr: irrVal,
  };
}
