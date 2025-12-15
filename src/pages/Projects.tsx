// src/pages/Projects.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import {
  SHADOW_PRICE_PER_TONN_NOK,
  calculateProjectMetrics,
  fmtNok,
  fmtNumber,
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

  created_at: string;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
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
  });

  async function load() {
    try {
      setError(null);
      setLoading(true);

      const { data, error } = await supabase
        .from("measures_projects")
        .select(
          "id, title, description, category, vendor, status, capex_nok, opex_annual_nok, expected_reduction_rate, lifetime_years, discount_rate, carbon_price_per_ton_nok, created_at"
        )
        .eq("org_id", ACTIVE_ORG_ID)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped: ProjectRow[] = (data ?? []).map((r: any) => ({
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
        carbon_price_per_ton_nok: Number(
          r.carbon_price_per_ton_nok ?? SHADOW_PRICE_PER_TONN_NOK
        ),

        created_at: String(r.created_at ?? ""),
      }));

      setProjects(mapped);
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
        carbon_price_per_ton_nok: Number(
          form.carbon_price_per_ton_nok ?? SHADOW_PRICE_PER_TONN_NOK
        ),
      };

      const { error } = await supabase.from("measures_projects").insert(payload);
      if (error) throw error;

      setForm((f) => ({ ...f, title: "", description: "", vendor: "" }));
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Kunne ikke opprette tiltak");
    }
  }

  async function deleteProject(id: string) {
    const ok = window.confirm(
      "Er du sikker på at du vil slette dette tiltaket?\nDette kan ikke angres."
    );
    if (!ok) return;

    try {
      setError(null);

      const { error } = await supabase
        .from("measures_projects")
        .delete()
        .eq("id", id)
        .eq("org_id", ACTIVE_ORG_ID);

      if (error) throw error;

      await load();
    } catch (e: any) {
      setError(e?.message ?? "Kunne ikke slette tiltak");
    }
  }

  useEffect(() => {
    load();

    const ch = supabase
      .channel("projects-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "measures_projects" },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computed = useMemo(() => {
    // Foreløpig: annual savings = 0 (til vi kobler til invoice_lines-baseline)
    return projects.map((p) => {
      const input: ProjectInput = {
        capexNok: p.capex_nok,
        opexAnnualNok: p.opex_annual_nok,
        annualCostSavingsNok: 0,
        annualCo2SavingsKg: 0,
        carbonPricePerTonNok: p.carbon_price_per_ton_nok,
        lifetimeYears: p.lifetime_years,
        discountRate: p.discount_rate,
      };

      const m = calculateProjectMetrics(input);
      return { p, m };
    });
  }, [projects]);

  if (loading) return <div className="p-6">Laster tiltak/ROI…</div>;
  if (error) return <div className="p-6 text-red-600">Feil: {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Tiltaksprosjekter</h1>
        <p className="text-sm text-neutral-600">
          Her lager dere “bank-ready” tiltak med CAPEX/OPEX, og vi regner NPV / payback.
          (Neste steg: koble tiltak til faktura-baseline for auto “annual savings”.)
        </p>
      </header>

      {/* Create form */}
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

          <Field label="Kategori">
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

          <Field label="Leverandør (valgfritt)">
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
              onChange={(e) =>
                setForm((f) => ({ ...f, capex_nok: Number(e.target.value) }))
              }
            />
          </Field>

          <Field label="Årlig OPEX (NOK)">
            <input
              className="w-full rounded-xl border p-2"
              type="number"
              value={form.opex_annual_nok}
              onChange={(e) =>
                setForm((f) => ({ ...f, opex_annual_nok: Number(e.target.value) }))
              }
            />
          </Field>

          <Field label="Forventet reduksjon (%)">
            <input
              className="w-full rounded-xl border p-2"
              type="number"
              step="0.01"
              value={form.expected_reduction_rate}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  expected_reduction_rate: Number(e.target.value),
                }))
              }
            />
          </Field>

          <Field label="Levetid (år)">
            <input
              className="w-full rounded-xl border p-2"
              type="number"
              value={form.lifetime_years}
              onChange={(e) =>
                setForm((f) => ({ ...f, lifetime_years: Number(e.target.value) }))
              }
            />
          </Field>

          <Field label="Diskonteringsrate (f.eks 0.08)">
            <input
              className="w-full rounded-xl border p-2"
              type="number"
              step="0.01"
              value={form.discount_rate}
              onChange={(e) =>
                setForm((f) => ({ ...f, discount_rate: Number(e.target.value) }))
              }
            />
          </Field>

          <Field label="CO₂-pris (NOK/tonn)">
            <input
              className="w-full rounded-xl border p-2"
              type="number"
              value={form.carbon_price_per_ton_nok}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  carbon_price_per_ton_nok: Number(e.target.value),
                }))
              }
            />
          </Field>
        </div>

        <Field label="Beskrivelse (valgfritt)">
          <textarea
            className="w-full rounded-xl border p-2"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Hva gjør tiltaket, hvorfor, antagelser…"
          />
        </Field>

        <button
          className="rounded-xl bg-emerald-600 text-white px-4 py-2 font-medium"
          onClick={createProject}
        >
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
            {computed.map(({ p, m }) => (
              <div key={p.id} className="rounded-2xl border bg-white shadow-sm p-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold">{p.title}</div>
                    <div className="text-sm text-neutral-600">
                      {p.category ?? "—"} {p.vendor ? `· ${p.vendor}` : ""} · status:{" "}
                      {p.status}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-sm text-neutral-600">
                      CO₂-pris: {fmtNok(p.carbon_price_per_ton_nok)} / tonn
                    </div>

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
                  <Card
                    title="Payback"
                    value={m.paybackYears === null ? "—" : `${fmtNumber(m.paybackYears, 1)} år`}
                  />
                </div>

                <div className="text-xs text-neutral-500">
                  Merk: Årlig “reell sparing” og CO₂-sparing kobles automatisk fra faktura-baseline i neste steg.
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
