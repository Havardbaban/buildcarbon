// src/lib/finance.ts

export const SHADOW_PRICE_PER_TONN_NOK = 2000;

// Scenarier du kan vise i UI (Tiltak)
export type SavingsScenario = {
  label: string;
  reductionRate: number; // 0.1 = 10%
};

export const DEFAULT_SCENARIOS: SavingsScenario[] = [
  { label: "Lav (10%)", reductionRate: 0.1 },
  { label: "Middels (30%)", reductionRate: 0.3 },
  { label: "Høy (50%)", reductionRate: 0.5 },
];

// ---- Types (tilpasset tabellene deres) ----

export type InvoiceRow = {
  id: string;
  vendor: string | null;
  total: number | null;
  total_co2_kg: number | null;
};

export type InvoiceLineRow = {
  invoice_id: string;
  vendor?: string | null; // vi kan join’e vendor fra invoices i koden
  line_total?: number | null; // hvis dere har "total" på linje
  total?: number | null; // noen har total-felt på linje - vi håndterer begge
  category?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
};

// ---- Enhetsnormalisering ----

function normUnit(u?: string | null) {
  if (!u) return null;
  const s = u.trim().toLowerCase();
  if (s === "kwh") return "kWh";
  if (s === "l" || s === "liter" || s === "litre") return "L";
  if (s === "km" || s === "kilometer") return "km";
  if (s === "kg") return "kg";
  if (s === "tonn" || s === "t" || s === "ton") return "t";
  return u;
}

function lineAmountNok(line: InvoiceLineRow) {
  // støtter flere mulige feltnavn
  const a =
    (typeof line.line_total === "number" ? line.line_total : null) ??
    (typeof line.total === "number" ? line.total : null);
  return a ?? 0;
}

// ---- Modell: hva slags kategori kan gi “ekte” savings? ----
// Dette er en enkel, praktisk modell. Start med få kategorier og utvid.

export type CategoryModel = {
  // forventet unit (for å unngå å regne feil)
  unit: "kWh" | "L" | "km" | "kg" | "t";
  // emission factor per unit (kg CO2 per unit) – grovt
  // NB: bytt til mer presis senere (land/energimiks osv)
  emissionFactorKgCo2PerUnit: number;
  // “ekte” kostbesparelse antas proporsjonal med reduksjon i mengde
  // (dvs samme enhetspris)
  defaultReductionRate: number; // typisk potensial for kategori
};

export const CATEGORY_MODELS: Record<string, CategoryModel> = {
  electricity: {
    unit: "kWh",
    emissionFactorKgCo2PerUnit: 0.10,
    defaultReductionRate: 0.15,
  },
  fuel: {
    unit: "L",
    emissionFactorKgCo2PerUnit: 2.60,
    defaultReductionRate: 0.10,
  },
  transport: {
    unit: "km",
    emissionFactorKgCo2PerUnit: 0.18,
    defaultReductionRate: 0.10,
  },
  waste: {
    unit: "kg",
    emissionFactorKgCo2PerUnit: 0.50,
    defaultReductionRate: 0.10,
  },
};

// ---- Resultater ----

export type ShadowSavings = {
  scenarioLabel: string;
  reductionRate: number;
  co2ReducedKg: number;
  shadowSavingsNok: number;
};

export type RealSavings = {
  category: string;
  unit: string;
  baselineQuantity: number;
  baselineSpendNok: number;
  avgUnitPriceNok: number;
  assumedReductionRate: number;
  quantityReduced: number;
  costSavingsNok: number;
  co2SavingsKg: number;
  shadowSavingsNok: number;
};

// ---- Beregninger ----

// (A) Basert på invoices (CO₂ × skyggepris)
export function calculateShadowSavingsFromInvoices(
  invoices: InvoiceRow[],
  scenarios: SavingsScenario[] = DEFAULT_SCENARIOS
): ShadowSavings[] {
  const totalCo2Kg = invoices.reduce((sum, r) => sum + (r.total_co2_kg ?? 0), 0);

  return scenarios.map((s) => {
    const co2ReducedKg = totalCo2Kg * s.reductionRate;
    const shadowSavingsNok = (co2ReducedKg / 1000) * SHADOW_PRICE_PER_TONN_NOK;
    return {
      scenarioLabel: s.label,
      reductionRate: s.reductionRate,
      co2ReducedKg,
      shadowSavingsNok,
    };
  });
}

// (B) Basert på invoice_lines når vi har quantity/unit/category
export function calculateRealSavingsFromLines(
  lines: InvoiceLineRow[],
  opts?: { overrideReductionRate?: number }
): RealSavings[] {
  // grupper per category
  const byCat: Record<
    string,
    { qty: number; spend: number; unit: string | null; model?: CategoryModel }
  > = {};

  for (const line of lines) {
    const category = (line.category ?? "").trim().toLowerCase();
    if (!category) continue;

    const model = CATEGORY_MODELS[category];
    if (!model) continue; // vi regner kun på kategorier vi kjenner

    const unit = normUnit(line.unit);
    if (unit !== model.unit) continue; // unngå feil (kWh vs L osv)

    const quantity = typeof line.quantity === "number" ? line.quantity : 0;
    if (!quantity || quantity <= 0) continue;

    const spend = lineAmountNok(line);

    if (!byCat[category]) {
      byCat[category] = { qty: 0, spend: 0, unit, model };
    }
    byCat[category].qty += quantity;
    byCat[category].spend += spend;
  }

  const out: RealSavings[] = [];

  for (const [category, agg] of Object.entries(byCat)) {
    const model = agg.model!;
    const baselineQuantity = agg.qty;
    const baselineSpendNok = agg.spend;

    const avgUnitPriceNok =
      baselineQuantity > 0 ? baselineSpendNok / baselineQuantity : 0;

    const assumedReductionRate =
      typeof opts?.overrideReductionRate === "number"
        ? opts.overrideReductionRate
        : model.defaultReductionRate;

    const quantityReduced = baselineQuantity * assumedReductionRate;
    const costSavingsNok = quantityReduced * avgUnitPriceNok;

    const co2SavingsKg = quantityReduced * model.emissionFactorKgCo2PerUnit;
    const shadowSavingsNok = (co2SavingsKg / 1000) * SHADOW_PRICE_PER_TONN_NOK;

    out.push({
      category,
      unit: model.unit,
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

  // sort: høyest estimert kost-besparelse først
  out.sort((a, b) => b.costSavingsNok - a.costSavingsNok);

  return out;
}

// Små helper-format (valgfritt)
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
// ---------------------------------------------------------------------
// Backwards compatible exports for ESG.tsx
// (ESG expects calculateFinanceMetrics + FinanceMetrics)
// ---------------------------------------------------------------------

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

  const carbonShadowCostNok =
    (totalCo2Kg / 1000) * SHADOW_PRICE_PER_TONN_NOK;

  return {
    totalSpendNok,
    totalCo2Kg,
    carbonIntensityPerNokGram,
    co2PerMillionNokTonnes,
    carbonShadowCostNok,
  };
}
