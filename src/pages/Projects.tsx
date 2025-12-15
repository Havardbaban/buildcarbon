// src/pages/Projects.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import {
  SHADOW_PRICE_PER_TONN_NOK,
  calculateProjectMetrics,
  calculateBaselineForProject,
  fmtNok,
  fmtNumber,
  type InvoiceRow,
  type InvoiceLineRow,
  type ProjectInput,
} from "../lib/finance";

type ProjectRow = {
  id: string;
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

  use_overrides: boolean;
  annual_cost_savings_override_nok: number;
  annual_co2_savings_override_kg: number;

  created_at: string;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [lines, setLines] = useState<InvoiceLineRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    use_overrides: false,
    annual_cost_savings_override_nok: 0,
    annual_co2_savings_override_kg: 0,
  });

  async function loadAll() {
    try {
      setError(null);
      setLoading(true);

      const { data: pData, error: pErr } = await supabase
        .from("measures_projects")
        .select(
          "id, title, description, category, vendor, status, capex_nok, opex_annual_nok, expected_reduction_rate, lifetime_years, discount_rate, carbon_price_per_ton_nok, baseline_months, vendor_filter, use_overrides, annual_cost_savings_override_nok, annual_co2_savings_override_kg, created_at"
        )
        .eq("org_id", ACTIVE_ORG_ID)
        .order("created_at", { ascending: false });

      if (pErr) throw pErr;

      const mappedProjects: ProjectRow[] = (pData ?? []).map((r: any) => ({
        id: String(r.id),
        title: String(r.title ?? ""),
        description: r.description ?? null,
        category: r.category ?? null,
        vendor: r.vendor ?? null,
        status: String(r.status ?? "draft"),

        capex_nok: Number(r.capex_nok ?? 0),
        opex_annual_nok: Number(r.opex_annual_nok ?? 0),
        expected_reduction_rate: Number(r.expected_reduction_rate ?? 0.1),

        lifetime_years: Number(r.lifetime_years ?? 5),
        discount_rate: Number(r.discount_rate ?? 0.08),
        carbon_price_per_ton_nok: Number(r.carbon_price_per_ton_nok ?? SHADOW_PRICE_PER_TONN_NOK),

        baseline_months: Number(r.baseline_months ?? 12),
        vendor_filter: r.vendor_filter ?? null,

        use_overrides: Boolean(r.use_overrides ?? false),
        annual_cost_savings_override_nok: Number(r.annual_cost_savings_override_nok ?? 0),
        annual_co2_savings_override_kg: Number(r.annual_co2_savings_override_kg ?? 0),

        created_at: String(r.created_at ?? ""),
      }));

      const { data: iData, error: iErr } = await supabase
        .from("invoices")
        .select("id, vendor, amount_nok, total_co2_kg, invoice_date, created_at")
        .eq("org_id", ACTIVE_ORG_ID);

      if (iErr) throw iErr;

      const mappedInvoices: InvoiceRow[] = (iData ?? []).map((r: any) => ({
        id: String(r.id),
        vendor: r.vendor ?? null,
        amount_nok: typeof r.amount_nok === "number" ? r.amount_nok : Number(r.amount_nok ?? 0),
        total_co2_kg: typeof r.total_co2_kg === "number" ? r.total_co2_kg : Number(r.total_co2_kg ?? 0),
        invoice_date: r.invoice_date ?? null,
        created_at: r.created_at ?? null,
      }));

      const invoiceIds = mappedInvoices.map((x) => x.id);
      let mappedLines: InvoiceLineRow[] = [];

      if (invoiceIds.length > 0) {
        const { data: lData, error: lErr } = await supabase
          .from("invoice_lines")
          .select("invoice_id, category, quantity, unit, unit_price, line_total, total")
          .in("invoice_id", invoiceIds);

        if (lErr) {
          console.warn("invoice_lines load failed:", lErr);
        } else {
          mappedLines = (lData ?? []).map((r: any) => ({
            invoice_id: String(r.invoice_id),
            category: r.category ?? null,
            quantity: r.quantity == null ? null : Number(r.quantity),
            unit: r.unit ?? null,
            unit_price: r.unit_price == null ? null : Number(r.unit_price),
            line_total: r.line_total == null ? null : Number(r.line_total),
            total: r.total == null ? null : Number(r.total),
          }));
        }
      }

      setProjects(mappedProjects);
      setInvoices(mappedInvoices);
      setLines(mappedLines);
    } catch (e: any) {
      setError(e?.message ?? "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }

  async function createProject() {
    try {
      setError(null);

      const payload = {
        org_id: ACTIVE_ORG_ID,
        title: form.title.trim() || "Nytt tiltak",
        description: form.description.trim() || null,
        category: form.category || null,
        vendor: form.vendor.trim() || null,
        status: "draft",

        capex_nok: Number(form.capex_nok ?? 0),
        opex_annual_nok: Number(form.opex_annual_nok ?? 0),
        expected_reduction_rate: Number(form.expected_reduction_rate ?? 0.1),

        lifetime_years: Number(form.lifetime_years ?? 5),
        discount_rate: Number(form.discount_rate ?? 0.08),
        carbon_price_per_ton_nok: Number(form.carbon_price_per_ton_nok ?? SHADOW_PRICE_PER_TONN_NOK),

        baseline_months: Number(form.baseline_months ?? 12),
        vendor_filter: form.vendor_filter.trim() || null,

        use_overrides: Boolean(form.use_overrides),
        annual_cost_savings_override_nok: Number(form.annual_cost_savings_override_nok ?? 0),
        annual_co2_savings_override_kg: Number(form.annual_co2_savings_override_kg ?? 0),
      };

      const { error } = await supabase.from("measures_projects").insert(payload);
      if (error) throw error;

      setForm((f) => ({
        ...f,
        title: "",
        description: "",
        vendor: "",
        vendor_filter: "",
        use_overrides: false,
        annual_cost_savings_override_nok: 0,
        annual_co2_savings_override_kg: 0,
      }));

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Kunne ikke opprette tiltak");
    }
  }

  async function deleteProject(id: string) {
    const ok = window.confirm("Er du sikker på at du vil slette dette tiltaket?\nDette kan ikke angres.");
    if (!ok) return;

    try {
      setError(null);

      const { error } = await supabase
        .from("measures_projects")
        .delete()
        .eq("id", id)
        .eq("org_id", ACTIVE_ORG_ID);

      if (error) throw error;

      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Kunne ikke slette tiltak");
    }
  }

  useEffect(() => {
    loadAll();

    const ch = supabase
      .channel("projects-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "measures_projects" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_lines" }, loadAll)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computed = useMemo(() => {
    return projects.map((p) => {
      const baseline = calculateBaselineForProject({
        project: {
          category: p.category,
          expected_reduction_rate: p.expected_reduction_rate,
          carbon_price_per_ton_nok: p.carbon_price_per_ton_nok,
          baseline_months: p.baseline_months,
          vendor_filter: p.vendor_filter,
          use_overrides: p.use_overrides,
          annual_cost_savings_override_nok: p.annual_cost_savings_override_nok,
          annual_co2_savings_override_kg: p.annual_co2_savings_override_kg,
        },
        invoices,
        lines,
      });

      const input: ProjectInput = {
        capexNok: p.capex_nok,
        opexAnnualNok: p.opex_annual_nok,
        annualCostSavingsNok: baseline.annualCostSavingsNok,
        annualCo2SavingsKg: baseline.annualCo2SavingsKg,
        carbonPricePerTonNok: p.carbon_price_per_ton_nok,
        lifetimeYears: p.lifetime_years,
        discountRate: p.discount_rate,
      };

      const m = calculateProjectMetrics(input);

      return { p, baseline, m };
    });
  }, [projects, invoices, lines]);

  if (loading) return <div className="p-6">Laster tiltak/ROI…</div>;
  if (error) return <div className="p-6 text-red-600">Feil: {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Tiltaksprosjekter</h1>
        <p className="text-sm text-neutral-600">
          Nå kobles tiltak automatisk til faktura-baseline (invoice_lines først, fallback til invoices).
        </p>
        <div className="text-xs text-neutral-500">
          Debug: invoices={invoices.length} · invoice_lines={lines.length}
        </div>
      </header>

      {/* Create */}
      <section className="rounded-2xl border bg-white shadow-sm p-4 space-y-3">
        <div className="text-lg font-semibold">Legg til nytt tiltak</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Tittel">
            <input
              className="w-full rounded-xl border p-2"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Bytt til grønn strøm / effektivisering / …"
            />
          </Field>

          <Field label="Kategori (matcher invoice_lines.category)">
            <select
              className="w-full rounded-xl border p-2"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="electricity">electricity</option>
              <option value="fuel">fuel</option>
              <option value="transport">transport</option>
              <option value="waste">waste</option>
              <option value="other">other</option>
            </select>
          </Field>

          <Field label="Vendor (valgfritt, kun label)">
            <input
              className="w-full rounded-xl border p-2"
              value={form.vendor}
              onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
              placeholder="DN Media / Hafslund / …"
            />
          </Field>

          <Field label="CAPEX (NOK)">
            <input
              className="w-full rounded-xl border p-2"
              type="number"
              value={form.capex_nok}
              onChange={(e) => setForm((f) => ({ ...f, capex_nok: Number(e.target.value) }))}
            />
          </Field>

          <Field label="Årlig OPEX (NOK)">
            <input
              className="w-full rounded-xl border p-2"
              type="number"
              value={form.opex_annual_nok}
              onChange={(e) => setForm((f) => ({ ...f, opex_annual_nok: Number(e.target.value) }))}
            />
          </Field>

          <Field label="Forventet reduksjon (0.1 = 10%)">
            <input
              className="w-full rounded-xl border p-2"
              type="number"
              step="0.01"
              value={form.expected_reduction_rate}
              onChange={(e) => setForm((f) => ({ ...f, expected_reduction_rate: Number(e.target.value) }))}
            />
          </Field>

          <Field label="Baseline (mnd)">
            <input
              className="w-full rounded-xl border p-2"
              type="number"
              value={form.baseline_months}
              onChange={(e) => setForm((f) => ({ ...f, baseline_months: Number(e.target.value) }))}
            />
          </Field>

          <Field label="Vendor filter (fallback via invoices.vendor)">
            <input
              className="w-full rounded-xl border p-2"
              value={form.vendor_filter}
              onChange={(e) => setForm((f) => ({ ...f, vendor_filter: e.target.value }))}
              placeholder="Snill match (contains) – f.eks. 'dn' eller 'hafslund'"
            />
          </Field>

          <Field label="CO₂-pris (NOK/tonn)">
            <input
              className="w-full rounded-xl border p-2"
              type="number"
              value={form.carbon_price_per_ton_nok}
              onChange={(e) => setForm((f) => ({ ...f, carbon_price_per_ton_nok: Number(e.target.value) }))}
            />
          </Field>
        </div>

        <div className="rounded-xl border bg-neutral-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.use_overrides}
              onChange={(e) => setForm((f) => ({ ...f, use_overrides: e.target.checked }))}
            />
            <div className="text-sm font-medium">Bruk manuell overstyring (audit)</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Override: årlig kost-sparing (NOK)">
              <input
                className="w-full rounded-xl border p-2"
                type="number"
                value={form.annual_cost_savings_override_nok}
                onChange={(e) =>
                  setForm((f) => ({ ...f, annual_cost_savings_override_nok: Number(e.target.value) }))
                }
              />
            </Field>

            <Field label="Override: årlig CO₂-sparing (kg)">
              <input
                className="w-full rounded-xl border p-2"
                type="number"
                value={form.annual_co2_savings_override_kg}
                onChange={(e) =>
                  setForm((f) => ({ ...f, annual_co2_savings_override_kg: Number(e.target.value) }))
                }
              />
            </Field>
          </div>
        </div>

        <Field label="Beskrivelse (valgfritt)">
          <textarea
            className="w-full rounded-xl border p-2"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Hva gjør tiltaket, hvorfor, antagelser…"
          />
        </Field>

        <button className="rounded-xl bg-emerald-600 text-white px-4 py-2 font-medium" onClick={createProject}>
          Opprett tiltak
        </button>
      </section>

      {/* List */}
      <section className="space-y-3">
        <div className="text-lg font-semibold">Tiltak (med finans)</div>

        {computed.length === 0 ? (
          <div className="text-sm text-neutral-600">Ingen tiltak ennå.</div>
        ) : (
          <div className="space-y-3">
            {computed.map(({ p, baseline, m }) => (
              <div key={p.id} className="rounded-2xl border bg-white shadow-sm p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold">{p.title}</div>
                    <div className="text-sm text-neutral-600">
                      {p.category ?? "—"} {p.vendor ? `· ${p.vendor}` : ""} · status: {p.status}
                    </div>
                    <div className="text-xs text-neutral-500">
                      Baseline: {p.baseline_months} mnd · Datakilde: {baseline.dataSource}
                    </div>
                    <div className="text-xs text-neutral-500">
                      Debug: invoices={invoices.length} · lines={lines.length} · vendor_filter={(p.vendor_filter ?? "—")}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-sm text-neutral-600">CO₂-pris: {fmtNok(p.carbon_price_per_ton_nok)} / tonn</div>
                    <button
                      onClick={() => deleteProject(p.id)}
                      className="rounded-xl border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Slett
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Card title="CAPEX" value={fmtNok(p.capex_nok)} />
                  <Card title="Årlig OPEX" value={fmtNok(p.opex_annual_nok)} />
                  <Card title="NPV" value={fmtNok(m.npvNok)} />
                  <Card title="Payback" value={m.paybackYears === null ? "—" : `${fmtNumber(m.paybackYears, 1)} år`} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Card title="Baseline spend" value={fmtNok(baseline.baselineSpendNok)} />
                  <Card
                    title="Baseline mengde"
                    value={baseline.baselineUnit ? `${fmtNumber(baseline.baselineQuantity, 0)} ${baseline.baselineUnit}` : "—"}
                  />
                  <Card title="Årlig kost-sparing" value={fmtNok(baseline.annualCostSavingsNok)} />
                  <Card title="Årlig CO₂-sparing" value={`${fmtNumber(baseline.annualCo2SavingsKg, 1)} kg`} />
                </div>

                <div className="text-xs text-neutral-600">
                  Årlig skygge-sparing (CO₂ × pris) er inkludert i NPV: <b>{fmtNok(m.annualShadowSavingsNok)}</b> / år
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-neutral-600">{label}</div>
      {children}
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4">
      <div className="text-sm text-neutral-600">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
