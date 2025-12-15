// src/pages/Measures.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import { fmtNok, fmtNumber, SHADOW_PRICE_PER_TONN_NOK } from "../lib/finance";

type MeasureRow = {
  id: string;
  org_id: string;
  name: string;
  category: string;
  vendor_filter: string | null;
  reduction_rate: number; // 0.1 = 10%
  baseline_months: number;
  created_at: string;
};

type BaselineAgg = {
  spendNok: number; // period spend
  co2Kg: number; // period co2
};

function safeNum(x: any) {
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : 0;
}

function isoMonthsAgo(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

const FALLBACK_CATEGORIES = ["electricity", "fuel", "transport", "waste", "other"];

export default function MeasuresPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // dropdown data
  const [categories, setCategories] = useState<string[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);

  // measures list
  const [measures, setMeasures] = useState<MeasureRow[]>([]);

  // summary cards (potential)
  const [summary, setSummary] = useState({
    annualCostSavingNok: 0,
    annualCo2SavingKg: 0,
    annualShadowSavingNok: 0,
  });

  // create form
  const [form, setForm] = useState({
    name: "",
    category: "",
    vendor_filter: "Alle",
    reduction_pct: 10,
    baseline_months: 12,
  });

  const reductionRate = useMemo(() => Math.max(0, Math.min(1, safeNum(form.reduction_pct) / 100)), [form.reduction_pct]);

  async function loadDropdowns() {
    // 1) categories from invoice_lines.category (non-null) joined to invoices for org
    const { data: lines, error: e1 } = await supabase
      .from("invoice_lines")
      .select(
        `
        category,
        invoices!inner(org_id)
      `
      )
      .eq("invoices.org_id", ACTIVE_ORG_ID)
      .not("category", "is", null);

    if (e1) throw e1;

    const cats = Array.from(
      new Set((lines ?? []).map((r: any) => String(r.category)).filter((x) => x && x !== "null" && x !== "undefined"))
    ).sort();

    // fallback if none exist
    const finalCats = cats.length > 0 ? cats : FALLBACK_CATEGORIES;

    setCategories(finalCats);

    // set default in form if empty
    setForm((p) => ({ ...p, category: p.category || finalCats[0] || "other" }));

    // 2) vendors from invoices.vendor
    const { data: invs, error: e2 } = await supabase
      .from("invoices")
      .select("vendor")
      .eq("org_id", ACTIVE_ORG_ID)
      .not("vendor", "is", null);

    if (e2) throw e2;

    const vset = Array.from(
      new Set((invs ?? []).map((r: any) => String(r.vendor)).filter((x) => x && x !== "null" && x !== "undefined"))
    ).sort();

    setVendors(vset);
  }

  async function loadMeasures() {
    const { data, error } = await supabase
      .from("measures")
      .select("*")
      .eq("org_id", ACTIVE_ORG_ID)
      .order("created_at", { ascending: false });

    if (error) throw error;
    setMeasures((data ?? []) as any);
  }

  async function getBaselineAgg(args: { category: string; vendorFilter: string | null; months: number }): Promise<BaselineAgg> {
    const since = isoMonthsAgo(args.months);

    // Try invoice_lines first (category)
    const q1 = supabase
      .from("invoice_lines")
      .select(
        `
        category,
        line_total,
        total,
        quantity,
        unit_price,
        invoices!inner(id, org_id, vendor, created_at, amount_nok, total_co2_kg)
      `
      )
      .eq("invoices.org_id", ACTIVE_ORG_ID)
      .gte("invoices.created_at", since)
      .eq("category", args.category);

    const q1Filtered =
      args.vendorFilter && args.vendorFilter.trim().length > 0
        ? q1.ilike("invoices.vendor", `%${args.vendorFilter.trim()}%`)
        : q1;

    const { data: lines, error: e1 } = await q1Filtered;
    if (e1) throw e1;

    if ((lines ?? []).length > 0) {
      let spend = 0;
      let co2 = 0;

      for (const r of lines as any[]) {
        const inv = r.invoices;
        const lineSpend =
          (r.line_total != null ? safeNum(r.line_total) : r.total != null ? safeNum(r.total) : 0) ||
          (r.quantity != null && r.unit_price != null ? safeNum(r.quantity) * safeNum(r.unit_price) : 0);

        spend += lineSpend;

        // allocate invoice CO2 by spend share
        const invAmount = safeNum(inv?.amount_nok);
        const invCo2 = safeNum(inv?.total_co2_kg);
        if (invAmount > 0 && invCo2 > 0 && lineSpend > 0) {
          co2 += invCo2 * (lineSpend / invAmount);
        }
      }

      if (spend > 0) return { spendNok: spend, co2Kg: co2 };
    }

    // fallback: invoices only (vendor filtered)
    const q2 = supabase
      .from("invoices")
      .select("amount_nok, total_co2_kg, vendor, created_at")
      .eq("org_id", ACTIVE_ORG_ID)
      .gte("created_at", since);

    const q2Filtered =
      args.vendorFilter && args.vendorFilter.trim().length > 0
        ? q2.ilike("vendor", `%${args.vendorFilter.trim()}%`)
        : q2;

    const { data: invs, error: e2 } = await q2Filtered;
    if (e2) throw e2;

    const spend2 = (invs ?? []).reduce((s: number, r: any) => s + safeNum(r.amount_nok), 0);
    const co22 = (invs ?? []).reduce((s: number, r: any) => s + safeNum(r.total_co2_kg), 0);

    return { spendNok: spend2, co2Kg: co22 };
  }

  async function refreshSummary() {
    // This summary is “potential annual savings” based on baseline window
    const vendorFilter = form.vendor_filter === "Alle" ? null : form.vendor_filter;

    const baseline = await getBaselineAgg({
      category: form.category || "other",
      vendorFilter,
      months: Math.max(1, Math.min(60, safeNum(form.baseline_months) || 12)),
    });

    const annualSpend = (baseline.spendNok / (safeNum(form.baseline_months) || 12)) * 12;
    const annualCo2 = (baseline.co2Kg / (safeNum(form.baseline_months) || 12)) * 12;

    const annualCostSavingNok = annualSpend * reductionRate;
    const annualCo2SavingKg = annualCo2 * reductionRate;
    const annualShadowSavingNok = (annualCo2SavingKg / 1000) * SHADOW_PRICE_PER_TONN_NOK;

    setSummary({ annualCostSavingNok, annualCo2SavingKg, annualShadowSavingNok });
  }

  async function loadAll() {
    try {
      setError(null);
      setLoading(true);
      await loadDropdowns();
      await loadMeasures();
    } catch (e: any) {
      setError(e?.message ?? "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update summary when form changes
  useEffect(() => {
    if (!form.category) return;
    refreshSummary().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.category, form.vendor_filter, form.reduction_pct, form.baseline_months]);

  async function createMeasure(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(null);

      const payload = {
        org_id: ACTIVE_ORG_ID,
        name: form.name,
        category: form.category || "other",
        vendor_filter: form.vendor_filter === "Alle" ? null : form.vendor_filter,
        reduction_rate: reductionRate,
        baseline_months: Math.max(1, Math.min(60, safeNum(form.baseline_months) || 12)),
      };

      const { error } = await supabase.from("measures").insert(payload);
      if (error) throw error;

      setForm((p) => ({ ...p, name: "" }));
      await loadMeasures();
    } catch (e: any) {
      setError(e?.message ?? "Kunne ikke opprette tiltak");
    }
  }

  async function deleteMeasure(id: string) {
    try {
      const { error } = await supabase.from("measures").delete().eq("id", id).eq("org_id", ACTIVE_ORG_ID);
      if (error) throw error;
      await loadMeasures();
    } catch (e: any) {
      setError(e?.message ?? "Kunne ikke slette");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tiltak</h1>
        <p className="text-sm text-neutral-600">
          Tiltak kobles nå til faktura-baseline (invoice_lines) slik at du får ekte kr- og kg-sparing.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {/* Top summary cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="Potensiell årlig kost-sparing" value={fmtNok(summary.annualCostSavingNok)} />
        <Card
          label="Potensiell årlig CO₂-sparing"
          value={`${fmtNumber(summary.annualCo2SavingKg / 1000, 1)} t`}
          sub={`${fmtNumber(summary.annualCo2SavingKg, 0)} kg`}
        />
        <Card label="Årlig skyggegevinst (CO₂-pris)" value={fmtNok(summary.annualShadowSavingNok)} />
      </div>

      {/* Create */}
      <form onSubmit={createMeasure} className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <div className="text-lg font-semibold">Nytt tiltak</div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <div className="text-xs text-neutral-600 mb-1">Navn</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="F.eks. Bytte til LED"
              required
            />
          </div>

          <div>
            <div className="text-xs text-neutral-600 mb-1">Kategori</div>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
            >
              {categories.length === 0 ? <option>Ingen kategorier funnet</option> : null}
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Helpful hint */}
            {categories.join("|") === FALLBACK_CATEGORIES.join("|") ? (
              <div className="mt-1 text-[11px] text-amber-700">
                Ingen kategorier funnet i invoice_lines. Viser fallback-kategorier. (Sett category på invoice_lines for auto-baseline.)
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-neutral-500">Hentes fra invoice_lines.category</div>
            )}
          </div>

          <div>
            <div className="text-xs text-neutral-600 mb-1">Vendor (valgfritt)</div>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={form.vendor_filter}
              onChange={(e) => setForm((p) => ({ ...p, vendor_filter: e.target.value }))}
            >
              <option value="Alle">Alle</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[11px] text-neutral-500">Filtrerer på invoices.vendor</div>
          </div>

          <div>
            <div className="text-xs text-neutral-600 mb-1">Reduksjon (%)</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="number"
              value={form.reduction_pct}
              onChange={(e) => setForm((p) => ({ ...p, reduction_pct: Number(e.target.value) }))}
            />
          </div>

          <div>
            <div className="text-xs text-neutral-600 mb-1">Baseline (mnd)</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="number"
              value={form.baseline_months}
              onChange={(e) => setForm((p) => ({ ...p, baseline_months: Number(e.target.value) }))}
            />
          </div>
        </div>

        <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white">Opprett tiltak</button>
      </form>

      {/* List */}
      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-4">
          <div className="text-lg font-semibold">Tiltaksliste</div>
          <div className="text-sm text-neutral-600">Hvert tiltak får baseline fra fakturaene dine (skalert til årlig).</div>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-neutral-600">Laster…</div>
        ) : measures.length === 0 ? (
          <div className="p-4 text-sm text-neutral-600">Ingen tiltak ennå.</div>
        ) : (
          <div className="divide-y">
            {measures.map((m) => (
              <div key={m.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-neutral-600">
                    {m.category} · {Math.round(safeNum(m.reduction_rate) * 100)}% · baseline {m.baseline_months} mnd · vendor:{" "}
                    {m.vendor_filter ?? "Alle"}
                  </div>
                </div>

                <button
                  className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                  onClick={() => deleteMeasure(m.id)}
                >
                  Slett
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-neutral-600">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub ? <div className="text-xs text-neutral-600">{sub}</div> : null}
    </div>
  );
}
