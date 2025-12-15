// src/lib/baseline.ts
import { supabase } from "./supabase";
import { ACTIVE_ORG_ID } from "./org";

export type BaselineResult = {
  source: "invoice_lines" | "invoices";
  months: number;

  spendNok_period: number; // spend in baseline window
  co2Kg_period: number; // co2 in baseline window (allocated if from lines)

  quantity_period: number | null; // sum qty in baseline window (if available)
  unit: string | null;

  invoicesCount: number;
  linesCount: number;
};

function isoMonthsAgo(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

function safeNum(x: any): number {
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : 0;
}

function computeLineSpend(row: any): number {
  const lineTotal = row?.line_total ?? row?.total;
  if (lineTotal != null) return safeNum(lineTotal);

  const qty = row?.quantity;
  const unitPrice = row?.unit_price;
  if (qty != null && unitPrice != null) return safeNum(qty) * safeNum(unitPrice);

  return 0;
}

export async function getBaselineForProject(args: {
  category: string;
  baselineMonths?: number | null;
  vendorFilter?: string | null; // optional
}): Promise<BaselineResult> {
  const months = Math.max(1, Math.min(60, Number(args.baselineMonths ?? 12)));
  const since = isoMonthsAgo(months);

  // -----------------------
  // 1) Try invoice_lines first (best baseline)
  // -----------------------
  const q1 = supabase
    .from("invoice_lines")
    .select(
      `
      id,
      category,
      quantity,
      unit,
      unit_price,
      line_total,
      invoices!inner(
        id,
        org_id,
        vendor,
        created_at,
        amount_nok,
        total_co2_kg
      )
    `
    )
    .eq("category", args.category)
    .eq("invoices.org_id", ACTIVE_ORG_ID)
    .gte("invoices.created_at", since);

  const q1Filtered =
    args.vendorFilter && args.vendorFilter.trim().length > 0
      ? q1.ilike("invoices.vendor", `%${args.vendorFilter.trim()}%`)
      : q1;

  const { data: lines, error: e1 } = await q1Filtered;
  if (e1) throw e1;

  if (Array.isArray(lines) && lines.length > 0) {
    let spend = 0;
    let co2 = 0;

    let qtySum: number | null = null;
    let unit: string | null = null;

    const invoiceIds = new Set<string>();

    for (const r of lines) {
      const inv = (r as any).invoices;
      if (inv?.id) invoiceIds.add(inv.id);

      const lineSpend = computeLineSpend(r);
      spend += lineSpend;

      // Allocate invoice CO2 proportional to spend share (best-effort)
      const invAmount = safeNum(inv?.amount_nok);
      const invCo2 = safeNum(inv?.total_co2_kg);
      if (invAmount > 0 && invCo2 > 0 && lineSpend > 0) {
        const share = lineSpend / invAmount;
        co2 += invCo2 * share;
      }

      // Quantity aggregation (only if unit matches)
      const q = (r as any).quantity;
      const u = (r as any).unit;
      if (q != null && u) {
        if (unit == null) {
          unit = String(u);
          qtySum = 0;
        }
        if (String(u) === unit) {
          qtySum = (qtySum ?? 0) + safeNum(q);
        }
      }
    }

    // If we got at least some spend OR quantity, treat this as valid baseline
    if (spend > 0 || (qtySum ?? 0) > 0) {
      return {
        source: "invoice_lines",
        months,
        spendNok_period: spend,
        co2Kg_period: co2, // can be 0 if invoices had 0/unknown co2
        quantity_period: qtySum,
        unit,
        invoicesCount: invoiceIds.size,
        linesCount: lines.length,
      };
    }
  }

  // -----------------------
  // 2) Fallback: invoices only (spend+co2, no quantity)
  // -----------------------
  const q2 = supabase
    .from("invoices")
    .select("id, org_id, vendor, created_at, amount_nok, total_co2_kg")
    .eq("org_id", ACTIVE_ORG_ID)
    .gte("created_at", since);

  const q2Filtered =
    args.vendorFilter && args.vendorFilter.trim().length > 0
      ? q2.ilike("vendor", `%${args.vendorFilter.trim()}%`)
      : q2;

  const { data: invs, error: e2 } = await q2Filtered;
  if (e2) throw e2;

  let spend2 = 0;
  let co22 = 0;

  for (const inv of invs ?? []) {
    spend2 += safeNum((inv as any).amount_nok);
    co22 += safeNum((inv as any).total_co2_kg);
  }

  return {
    source: "invoices",
    months,
    spendNok_period: spend2,
    co2Kg_period: co22,
    quantity_period: null,
    unit: null,
    invoicesCount: (invs ?? []).length,
    linesCount: 0,
  };
}
