// src/lib/measures.ts
import { supabase } from "./supabase";
import { ACTIVE_ORG_ID } from "./org";

export type MeasureRow = {
  id: string;
  org_id: string;

  name: string;
  category: string;
  vendor: string | null;
  reduction_percent: number; // 0-100
  baseline_months: number;

  capex_nok: number;
  opex_annual_nok: number;
  lifetime_years: number;
  discount_rate: number; // 0-1
  co2_price_nok_per_ton: number;

  notes: string | null;
  created_at: string;
};

export type MeasureBaseline = {
  months: number;

  period_amount_nok: number;
  period_co2_kg: number;

  annual_amount_nok: number;
  annual_co2_kg: number;

  annual_saving_nok: number;
  annual_saving_kg: number;

  annual_shadow_saving_nok: number;
};

// 🔧 Hvis schemaet ditt bruker andre navn, endre her:
const INVOICE_PK_COL = "id"; // invoices.id
const LINE_INVOICE_FK_COL = "invoice_id"; // invoice_lines.invoice_id

function monthsAgoISO(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

function toNum(x: any): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Hent invoices i perioden (org_id + created_at filter).
 * Returnerer både id-liste og et map id->vendor (til vendor-filter på tiltak).
 */
async function fetchInvoicesInPeriod(orgId: string, months: number) {
  const since = monthsAgoISO(months);

  const { data, error } = await supabase
    .from("invoices")
    .select(`${INVOICE_PK_COL}, vendor, created_at`)
    .eq("org_id", orgId)
    .gte("created_at", since);

  if (error) throw error;

  const ids: string[] = [];
  const vendorById: Record<string, string | null> = {};

  for (const r of data ?? []) {
    const id = (r as any)[INVOICE_PK_COL];
    if (!id) continue;
    ids.push(id);
    vendorById[id] = (r as any).vendor ?? null;
  }

  return { ids, vendorById, since };
}

/**
 * Kategorier fra invoice_lines, men filtrert til invoices i org + periode.
 */
export async function fetchInvoiceLineCategories(orgId = ACTIVE_ORG_ID): Promise<string[]> {
  // Vi bruker standard 12 mnd for dropdown (kan endres)
  const months = 12;
  const { ids } = await fetchInvoicesInPeriod(orgId, months);

  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("invoice_lines")
    .select("category")
    .in(LINE_INVOICE_FK_COL, ids);

  if (error) throw error;

  const set = new Set<string>();
  for (const r of data ?? []) {
    const c = (r as any).category;
    if (typeof c === "string" && c.trim()) set.add(c.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Vendor-list fra invoices (for dropdown).
 */
export async function fetchVendors(orgId = ACTIVE_ORG_ID): Promise<string[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("vendor")
    .eq("org_id", orgId);

  if (error) throw error;

  const set = new Set<string>();
  for (const r of data ?? []) {
    const v = (r as any).vendor;
    if (typeof v === "string" && v.trim()) set.add(v.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export async function fetchMeasures(orgId = ACTIVE_ORG_ID): Promise<MeasureRow[]> {
  const { data, error } = await supabase
    .from("measures")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as any;
}

export async function createMeasure(input: Partial<MeasureRow> & { name: string; category: string }) {
  const payload = {
    org_id: ACTIVE_ORG_ID,
    name: input.name,
    category: input.category,
    vendor: input.vendor ?? null,
    reduction_percent: toNum(input.reduction_percent ?? 10),
    baseline_months: Math.max(1, Math.floor(toNum(input.baseline_months ?? 12))),

    capex_nok: toNum(input.capex_nok ?? 0),
    opex_annual_nok: toNum(input.opex_annual_nok ?? 0),
    lifetime_years: Math.max(1, Math.floor(toNum(input.lifetime_years ?? 5))),
    discount_rate: toNum(input.discount_rate ?? 0.08),
    co2_price_nok_per_ton: toNum(input.co2_price_nok_per_ton ?? 1500),

    notes: input.notes ?? null,
  };

  const { error } = await supabase.from("measures").insert(payload);
  if (error) throw error;
}

export async function deleteMeasure(id: string) {
  const { error } = await supabase.from("measures").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Baseline + sparing:
 * - Filtrer invoices på org_id + periode
 * - Hent invoice_lines for disse invoice_id-ene + category
 * - Summer amount_nok + co2_kg
 * - Vendor-filter gjøres via invoice->vendor map
 */
export async function computeMeasureBaseline(
  measure: Pick<MeasureRow, "category" | "vendor" | "baseline_months" | "reduction_percent" | "co2_price_nok_per_ton">,
  orgId = ACTIVE_ORG_ID
): Promise<MeasureBaseline> {
  const months = Math.max(1, Math.floor(toNum(measure.baseline_months ?? 12)));

  const { ids, vendorById } = await fetchInvoicesInPeriod(orgId, months);
  if (ids.length === 0) {
    return {
      months,
      period_amount_nok: 0,
      period_co2_kg: 0,
      annual_amount_nok: 0,
      annual_co2_kg: 0,
      annual_saving_nok: 0,
      annual_saving_kg: 0,
      annual_shadow_saving_nok: 0,
    };
  }

  const { data, error } = await supabase
    .from("invoice_lines")
    .select("amount_nok, co2_kg, category, invoice_id")
    .eq("category", measure.category)
    .in(LINE_INVOICE_FK_COL, ids);

  if (error) throw error;

  let periodAmount = 0;
  let periodCo2 = 0;

  for (const row of data ?? []) {
    const invoiceId = (row as any)[LINE_INVOICE_FK_COL];
    const invVendor = invoiceId ? vendorById[invoiceId] : null;

    if (measure.vendor) {
      const want = measure.vendor.trim().toLowerCase();
      const have = (invVendor ?? "").trim().toLowerCase();
      if (!have || have !== want) continue;
    }

    periodAmount += toNum((row as any).amount_nok);
    periodCo2 += toNum((row as any).co2_kg);
  }

  // Skaler til "årlig baseline"
  const scale = 12 / months;
  const annualAmount = periodAmount * scale;
  const annualCo2 = periodCo2 * scale;

  // Sparing
  const rp = Math.min(100, Math.max(0, toNum(measure.reduction_percent)));
  const factor = rp / 100;

  const annualSavingNok = annualAmount * factor;
  const annualSavingKg = annualCo2 * factor;

  // Skyggegevinst
  const co2Price = toNum(measure.co2_price_nok_per_ton ?? 1500);
  const annualShadow = (annualSavingKg / 1000) * co2Price;

  return {
    months,
    period_amount_nok: periodAmount,
    period_co2_kg: periodCo2,
    annual_amount_nok: annualAmount,
    annual_co2_kg: annualCo2,
    annual_saving_nok: annualSavingNok,
    annual_saving_kg: annualSavingKg,
    annual_shadow_saving_nok: annualShadow,
  };
}

export function fmtNok(n: number) {
  return new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK", maximumFractionDigits: 0 }).format(n);
}
export function fmtKg(n: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n) + " kg";
}
export function fmtTon(nKg: number) {
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(nKg / 1000) + " t";
}
