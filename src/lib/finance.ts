// src/lib/finance.ts

// -----------------------------
// Constants
// -----------------------------
export const SHADOW_PRICE_PER_TONN_NOK = 2000;

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
  invoice_date?: string | null;
  created_at?: string | null;
};

export type InvoiceLineRow = {
  invoice_id: string;
  category?: string | null; // electricity/fuel/transport/waste/other
  quantity?: number | null; // e.g. 1000
  unit?: string | null; // kWh/L/km/kg
  unit_price?: number | null; // NOK per unit
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
// ESG Finance Metrics
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
  shadowSavingsNok: number;
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

  out.sort((a, b) => b.shadowSavingsNok - a.shadowSavingsNok);
  return out;
}

// -----------------------------
// Models for real savings
// -----------------------------
export type CategoryModel = {
  unit: "kWh" | "L" | "km" | "kg";
  emissionFactorKgCo2PerUnit: number; // coarse
  defaultReductionRate: number;
};

export const CATEGORY_MODELS: Record<string, CategoryModel> = {
  electricity: { unit: "kWh", emissionFactorKgCo2PerUnit: 0.1, defaultReductionRate: 0.15 },
  fuel: { unit: "L", emissionFactorKgCo2PerUnit: 2.6, defaultReductionRate: 0.1 },
  transport: { unit: "km", emissionFactorKgCo2PerUnit: 0.18, defaultReductionRate: 0.1 },
  waste: { unit: "kg", emissionFactorKgCo2PerUnit: 0.5, defaultReductionRate: 0.1 },
};

// -----------------------------
// Project ROI / Payback / NPV
// -----------------------------
export type ProjectInput = {
  capexNok: number;
  opexAnnualNok: number;
  annualCostSavingsNok: number;
  annualCo2SavingsKg: number;
  carbonPricePerTonNok: number;
  lifetimeYears: number;
  discountRate: number;
};

export type ProjectMetrics = {
  annualShadowSavingsNok: number;
  annualNetBenefitNok: number; // (cost savings + shadow savings) - opex
  paybackYears: number | null;
  npvNok: number;
  irr: number | null;
};

export function npv(discountRate: number, cashflows: number[]): number {
  let total = 0;
  for (let t = 0; t < cashflows.length; t++) {
    total += cashflows[t] / Math.pow(1 + discountRate, t);
  }
  return total;
}

export function irr(cashflows: number[]): number | null {
  const hasPos = cashflows.some((x) => x > 0);
  const hasNeg = cashflows.some((x) => x < 0);
  if (!hasPos || !hasNeg) return null;

  let lo = -0.9;
  let hi = 1.0;

  const f = (r: number) => npv(r, cashflows);

  let flo = f(lo);
  let fhi = f(hi);

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
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

export function calculateProjectMetrics(input: ProjectInput): ProjectMetrics {
  const annualShadowSavingsNok =
    (input.annualCo2SavingsKg / 1000) *
    (input.carbonPricePerTonNok || SHADOW_PRICE_PER_TONN_NOK);

  const annualNetBenefitNok =
    (input.annualCostSavingsNok || 0) + annualShadowSavingsNok - (input.opexAnnualNok || 0);

  const paybackYears = annualNetBenefitNok > 0 ? input.capexNok / annualNetBenefitNok : null;

  const cashflows: number[] = [-Math.max(0, input.capexNok)];
  for (let y = 1; y <= Math.max(1, input.lifetimeYears); y++) {
    cashflows.push(annualNetBenefitNok);
  }

  return {
    annualShadowSavingsNok,
    annualNetBenefitNok,
    paybackYears,
    npvNok: npv(input.discountRate || 0.08, cashflows),
    irr: irr(cashflows),
  };
}

// -----------------------------
// Baseline helpers (FIXED)
// -----------------------------
function parseDateSafe(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function pickInvoiceDate(inv: InvoiceRow): Date | null {
  // Prefer invoice_date if parseable, else fallback to created_at (ISO)
  const invDate = parseDateSafe(inv.invoice_date ?? null);
  if (invDate) return invDate;

  const created = parseDateSafe(inv.created_at ?? null);
  if (created) return created;

  return null;
}

export function filterInvoicesToBaselineWindow(
  invoices: InvoiceRow[],
  baselineMonths: number
): InvoiceRow[] {
  const months = Math.max(1, baselineMonths || 12);
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - months);

  return invoices.filter((inv) => {
    const dt = pickInvoiceDate(inv);
    if (!dt) return true; // best effort
    return dt >= start && dt <= now;
  });
}

// -----------------------------
// NEW: Baseline → annual savings for a project
// -----------------------------
export type ProjectBaselineResult = {
  baselineSpendNok: number;
  baselineQuantity: number;
  baselineUnit: string | null;
  annualCostSavingsNok: number;
  annualCo2SavingsKg: number;
  dataSource: "invoice_lines" | "invoices_fallback" | "override" | "none";
};

export function calculateBaselineForProject(params: {
  project: {
    category: string | null;
    expected_reduction_rate: number;
    carbon_price_per_ton_nok: number;
    baseline_months: number;
    vendor_filter?: string | null;
    use_overrides?: boolean;
    annual_cost_savings_override_nok?: number;
    annual_co2_savings_override_kg?: number;
  };
  invoices: InvoiceRow[];
  lines: InvoiceLineRow[];
}): ProjectBaselineResult {
  const p = params.project;

  if (p.use_overrides) {
    return {
      baselineSpendNok: 0,
      baselineQuantity: 0,
      baselineUnit: null,
      annualCostSavingsNok: safeNum(p.annual_cost_savings_override_nok),
      annualCo2SavingsKg: safeNum(p.annual_co2_savings_override_kg),
      dataSource: "override",
    };
  }

  const baselineInvoices = filterInvoicesToBaselineWindow(
    params.invoices,
    p.baseline_months || 12
  );

  const vendorFilter = (p.vendor_filter ?? "").trim().toLowerCase();

  const invoiceIdSet = new Set<string>();
  const invoiceById: Record<string, InvoiceRow> = {};

  for (const inv of baselineInvoices) {
    invoiceById[inv.id] = inv;

    const v = (inv.vendor ?? "").trim().toLowerCase();
    if (vendorFilter && v !== vendorFilter) continue;

    invoiceIdSet.add(inv.id);
  }

  const reductionRate = Math.max(0, Math.min(1, safeNum(p.expected_reduction_rate)));
  const cat = (p.category ?? "").trim().toLowerCase();
  const model = CATEGORY_MODELS[cat];

  // 1) Primary: invoice_lines with quantity+unit+price
  if (model) {
    let qty = 0;
    let spend = 0;

    for (const line of params.lines) {
      if (!invoiceIdSet.has(line.invoice_id)) continue;

      const c = (line.category ?? "").trim().toLowerCase();
      if (c !== cat) continue;

      const unit = normUnit(line.unit);
      if (unit !== model.unit) continue;

      const q = safeNum(line.quantity);
      if (q <= 0) continue;

      const explicit = safeNum(line.line_total) || safeNum(line.total);
      const unitPrice = safeNum(line.unit_price);
      const s = explicit > 0 ? explicit : unitPrice > 0 ? q * unitPrice : 0;

      qty += q;
      spend += s;
    }

    if (qty > 0 && spend >= 0) {
      const avgUnitPrice = spend / qty;
      const qtyReduced = qty * reductionRate;

      return {
        baselineSpendNok: spend,
        baselineQuantity: qty,
        baselineUnit: model.unit,
        annualCostSavingsNok: qtyReduced * avgUnitPrice,
        annualCo2SavingsKg: qtyReduced * model.emissionFactorKgCo2PerUnit,
        dataSource: "invoice_lines",
      };
    }
  }

  // 2) Fallback: invoices spend+co2 (vendor-filtered)
  let spend2 = 0;
  let co22 = 0;

  for (const id of invoiceIdSet) {
    const inv = invoiceById[id];
    spend2 += safeNum(inv.amount_nok);
    co22 += safeNum(inv.total_co2_kg);
  }

  if (spend2 > 0 || co22 > 0) {
    return {
      baselineSpendNok: spend2,
      baselineQuantity: 0,
      baselineUnit: null,
      annualCostSavingsNok: spend2 * reductionRate,
      annualCo2SavingsKg: co22 * reductionRate,
      dataSource: "invoices_fallback",
    };
  }

  return {
    baselineSpendNok: 0,
    baselineQuantity: 0,
    baselineUnit: null,
    annualCostSavingsNok: 0,
    annualCo2SavingsKg: 0,
    dataSource: "none",
  };
}
