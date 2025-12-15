// src/pages/Projects.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import { SHADOW_PRICE_PER_TONN_NOK, calculateProjectMetrics, fmtNok, fmtNumber } from "../lib/finance";
import { getBaselineForProject, BaselineResult } from "../lib/baseline";

type ProjectRow = {
  id: string;
  org_id: string;

  title: string;
  description: string | null;
  category: string | null;
  vendor: string | null;
  status: string;

  capex_nok: number;
  opex_annual_nok: number;
  expected_reduction_rate: number;
  lifetime_years: number;
  discount_rate: number;
  carbon_price_per_ton_nok: number;

  baseline_months: number;
  vendor_filter: string | null;

  use_override: boolean;
  override_annual_cost_saving_nok: number | null;
  override_annual_co2_saving_kg: number | null;

  created_at: string;
};

type ProjectView = {
  row: ProjectRow;
  baseline: BaselineResult;
  metrics: ReturnType<typeof calculateProjectMetrics>;
};

function safeNum(x: any): number {
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : 0;
}

export default function ProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectView[]>([]);

  // create form
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "electricity",
    vendor: "",
    capex_nok: 0,
    opex_annual_nok: 0,
    expected_reduction_rate: 0.1,
    lifetime_years: 5,
    discount_rate: 0.08,
    carbon_price_per_ton_nok: SHADOW_PRICE_PER_TONN_NOK,
    baseline_months: 12,
    vendor_filter: "",
    use_override: false,
    override_annual_cost_saving_nok: 0,
    override_annual_co2_saving_kg: 0,
  });

  async function load() {
    try {
      setError(null);
      setLoading(true);

      const { data, error } = await supabase
        .from("measures_projects")
        .select("*")
        .eq("org_id", ACTIVE_ORG_ID)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows: ProjectRow[] = (data ?? []) as any;

      // Compute baseline + metrics per project
      const views: ProjectView[] = [];
      for (const r of rows) {
        const baseline = await getBaselineForProject({
          category: r.category ?? "other",
          baselineMonths: r.baseline_months ?? 12,
          vendorFilter: (r.vendor_filter ?? "").trim() || null,
        });

        const metrics = calculateProjectMetrics(baseline.source, {
          capex_nok: safeNum(r.capex_nok),
          opex_annual_nok: safeNum(r.opex_annual_nok),
          expected_reduction_rate: safeNum(r.expected_reduction_rate),
          lifetime_years: safeNum(r.lifetime_years),
          discount_rate: safeNum(r.discount_rate),
          carbon_price_per_ton_nok: safeNum(r.carbon_price_per_ton_nok),

          baseline_months: baseline.months,
          baseline_spend_period_nok: baseline.spendNok_period,
          baseline_co2_period_kg: baseline.co2Kg_period,
          baseline_quantity_period: baseline.quantity_period,
          baseline_unit: baseline.unit,

          use_override: !!r.use_override,
          override_annual_cost_saving_nok: r.override_annual_cost_saving_nok,
          override_annual_co2_saving_kg: r.override_annual_co2_saving_kg,
        });

        views.push({ row: r, baseline, metrics });
      }

      setProjects(views);
    } catch (e: any) {
      setError(e?.message ?? "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError(null);

      const payload: any = {
        org_id: ACTIVE_ORG_ID,
        title: form.title,
        description: form.description || null,
        category: form.category,
        vendor: form.vendor || null,
        status: "draft",
        capex_nok: safeNum(form.capex_nok),
        opex_annual_nok: safeNum(form.opex_annual_nok),
        expected_reduction_rate: safeNum(form.expected_reduction_rate),
        lifetime_years: Math.round(safeNum(form.lifetime_years)),
        discount_rate: safeNum(form.discount_rate),
        carbon_price_per_ton_nok: safeNum(form.carbon_price_per_ton_nok),

        baseline_months: Math.round(safeNum(form.baseline_months)),
        vendor_filter: form.vendor_filter?.trim() || null,

        use_override: !!form.use_override,
        override_annual_cost_saving_nok: form.use_override ? safeNum(form.override_annual_cost_saving_nok) : null,
        override_annual_co2_saving_kg: form.use_override ? safeNum(form.override_annual_co2_saving_kg) : null,
      };

      const { error } = await supabase.from("measures_projects").insert(payload);
      if (error) throw error;

      setForm((p) => ({
        ...p,
        title: "",
        description: "",
      }));

      await load();
    } catch (e: any) {
      setError(e?.message ?? "Kunne ikke opprette tiltak");
    }
  }

  async function deleteProject(id: string) {
    try {
      setError(null);
      const { error } = await supabase.from("measures_projects").delete().eq("id", id).eq("org_id", ACTIVE_ORG_ID);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Kunne ikke slette");
    }
  }

  const categories = useMemo(
    () => [
      { value: "electricity", label: "electricity" },
      { value: "fuel", label: "fuel" },
      { value: "transport", label: "transport" },
      { value: "waste", label: "waste" },
      { value: "other", label: "other" },
    ],
    []
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tiltaksprosjekter</h1>
        <p className="text-sm text-neutral-600">
          Nå kobles tiltak automatisk til faktura-baseline (invoice_lines først, fallback til invoices).
        </p>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {/* Create form */}
      <form onSubmit={createProject} className="rounded-2xl border bg-white p-5 shadow-sm space-y-4">
        <div className="text-lg font-semibold">Legg til nytt tiltak</div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs text-neutral-600 mb-1">Tittel</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Bytt til grønn strøm / effektivisering / …"
              required
            />
          </div>

          <div>
            <div className="text-xs text-neutral-600 mb-1">Kategori (matcher invoice_lines.category)</div>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs text-neutral-600 mb-1">Vendor (valgfritt, kun label)</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={form.vendor}
              onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))}
              placeholder="DN Media / Hafslund / …"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs text-neutral-600 mb-1">CAPEX (NOK)</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="number"
              value={form.capex_nok}
              onChange={(e) => setForm((p) => ({ ...p, capex_nok: Number(e.target.value) }))}
            />
          </div>
          <div>
            <div className="text-xs text-neutral-600 mb-1">Årlig OPEX (NOK)</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="number"
              value={form.opex_annual_nok}
              onChange={(e) => setForm((p) => ({ ...p, opex_annual_nok: Number(e.target.value) }))}
            />
          </div>
          <div>
            <div className="text-xs text-neutral-600 mb-1">Forventet reduksjon (0.1 = 10%)</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="number"
              step="0.01"
              value={form.expected_reduction_rate}
              onChange={(e) => setForm((p) => ({ ...p, expected_reduction_rate: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs text-neutral-600 mb-1">Baseline (mnd)</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="number"
              value={form.baseline_months}
              onChange={(e) => setForm((p) => ({ ...p, baseline_months: Number(e.target.value) }))}
            />
          </div>
          <div>
            <div className="text-xs text-neutral-600 mb-1">Vendor filter (fallback via invoices.vendor)</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              value={form.vendor_filter}
              onChange={(e) => setForm((p) => ({ ...p, vendor_filter: e.target.value }))}
              placeholder="Skriv del av vendor-navn"
            />
          </div>
          <div>
            <div className="text-xs text-neutral-600 mb-1">CO₂-pris (NOK/tonn)</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="number"
              value={form.carbon_price_per_ton_nok}
              onChange={(e) => setForm((p) => ({ ...p, carbon_price_per_ton_nok: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs text-neutral-600 mb-1">Levetid (år)</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="number"
              value={form.lifetime_years}
              onChange={(e) => setForm((p) => ({ ...p, lifetime_years: Number(e.target.value) }))}
            />
          </div>
          <div>
            <div className="text-xs text-neutral-600 mb-1">Diskonteringsrate (f.eks 0.08)</div>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="number"
              step="0.01"
              value={form.discount_rate}
              onChange={(e) => setForm((p) => ({ ...p, discount_rate: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="rounded-2xl border bg-neutral-50 p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.use_override}
              onChange={(e) => setForm((p) => ({ ...p, use_override: e.target.checked }))}
            />
            Bruk manuell overstyring (audit)
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs text-neutral-600 mb-1">Override: årlig kost-sparing (NOK)</div>
              <input
                className="w-full rounded-xl border px-3 py-2"
                type="number"
                value={form.override_annual_cost_saving_nok}
                onChange={(e) => setForm((p) => ({ ...p, override_annual_cost_saving_nok: Number(e.target.value) }))}
                disabled={!form.use_override}
              />
            </div>
            <div>
              <div className="text-xs text-neutral-600 mb-1">Override: årlig CO₂-sparing (kg)</div>
              <input
                className="w-full rounded-xl border px-3 py-2"
                type="number"
                value={form.override_annual_co2_saving_kg}
                onChange={(e) => setForm((p) => ({ ...p, override_annual_co2_saving_kg: Number(e.target.value) }))}
                disabled={!form.use_override}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs text-neutral-600 mb-1">Beskrivelse (valgfritt)</div>
          <textarea
            className="w-full rounded-xl border px-3 py-2"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Hva gjør tiltaket, hvorfor, antagelser…"
          />
        </div>

        <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
          Opprett tiltak
        </button>
      </form>

      {/* List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Tiltak (med finans)</h2>

        {loading ? (
          <div className="text-sm text-neutral-600">Laster…</div>
        ) : projects.length === 0 ? (
          <div className="text-sm text-neutral-600">Ingen tiltak enda.</div>
        ) : (
          projects.map((p) => (
            <div key={p.row.id} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{p.row.title}</div>
                  <div className="text-xs text-neutral-600">
                    {p.row.category} · status: {p.row.status} <br />
                    Baseline: {p.baseline.months} mnd · Datakilde: {p.baseline.source} ·
                    {p.baseline.source === "invoice_lines"
                      ? ` linjer: ${p.baseline.linesCount}`
                      : ` fakturaer: ${p.baseline.invoicesCount}`}
                  </div>
                </div>

                <button
                  className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                  onClick={() => deleteProject(p.row.id)}
                >
                  Slett
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <Stat label="CAPEX" value={fmtNok(safeNum(p.row.capex_nok))} />
                <Stat label="Årlig OPEX" value={fmtNok(safeNum(p.row.opex_annual_nok))} />
                <Stat label="NPV" value={fmtNok(p.metrics.npvNok)} />
                <Stat label="Payback" value={p.metrics.paybackYears == null ? "—" : `${fmtNumber(p.metrics.paybackYears, 1)} år`} />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                <Stat label="Baseline spend (årlig)" value={fmtNok(p.metrics.baselineSpendAnnualNok)} />
                <Stat
                  label="Baseline mengde (årlig)"
                  value={
                    p.metrics.baselineQuantityAnnual == null
                      ? "—"
                      : `${fmtNumber(p.metrics.baselineQuantityAnnual, 0)} ${p.metrics.baselineUnit ?? ""}`
                  }
                />
                <Stat label="Årlig kost-sparing" value={fmtNok(p.metrics.annualCostSavingNok)} />
                <Stat label="Årlig CO₂-sparing" value={`${fmtNumber(p.metrics.annualCo2SavingKg, 0)} kg`} />
              </div>

              <div className="mt-2 text-xs text-neutral-600">
                Årlig skygge-sparing (CO₂ × pris) er inkludert i NPV: {fmtNok(p.metrics.annualShadowSavingNok)} / år ·
                Netto benefit: {fmtNok(p.metrics.annualNetBenefitNok)} / år
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-xs text-neutral-600">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
