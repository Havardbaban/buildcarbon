// src/pages/Measures.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  computeMeasureBaseline,
  createMeasure,
  deleteMeasure,
  fetchInvoiceLineCategories,
  fetchMeasures,
  fetchVendors,
  fmtKg,
  fmtNok,
  fmtTon,
  MeasureRow,
} from "../lib/measures";
import { ACTIVE_ORG_ID } from "../lib/org";

type BaselineMap = Record<string, Awaited<ReturnType<typeof computeMeasureBaseline>> | null>;

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function MeasuresPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [measures, setMeasures] = useState<MeasureRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);
  const [baselineById, setBaselineById] = useState<BaselineMap>({});

  // form
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [vendor, setVendor] = useState<string>(""); // empty = no filter
  const [reductionPercent, setReductionPercent] = useState("10");
  const [baselineMonths, setBaselineMonths] = useState("12");

  async function loadAll() {
    try {
      setErr(null);
      setLoading(true);

      const [cats, vends, ms] = await Promise.all([
        fetchInvoiceLineCategories(ACTIVE_ORG_ID),
        fetchVendors(ACTIVE_ORG_ID),
        fetchMeasures(ACTIVE_ORG_ID),
      ]);

      setCategories(cats);
      setVendors(vends);
      setMeasures(ms);

      // default category i form
      if (!category && cats.length) setCategory(cats[0]);

      // compute baselines
      const entries = await Promise.all(
        ms.map(async (m) => {
          try {
            const b = await computeMeasureBaseline(m, ACTIVE_ORG_ID);
            return [m.id, b] as const;
          } catch {
            return [m.id, null] as const;
          }
        })
      );

      const map: BaselineMap = {};
      for (const [id, b] of entries) map[id] = b;
      setBaselineById(map);
    } catch (e: any) {
      setErr(e?.message ?? "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    let annualSavingNok = 0;
    let annualSavingKg = 0;
    let annualShadow = 0;

    for (const m of measures) {
      const b = baselineById[m.id];
      if (!b) continue;
      annualSavingNok += b.annual_saving_nok;
      annualSavingKg += b.annual_saving_kg;
      annualShadow += b.annual_shadow_saving_nok;
    }

    return { annualSavingNok, annualSavingKg, annualShadow };
  }, [measures, baselineById]);

  async function onCreate() {
    try {
      setErr(null);
      setSaving(true);

      if (!name.trim()) throw new Error("Gi tiltaket et navn.");
      if (!category.trim()) throw new Error("Velg kategori.");

      await createMeasure({
        name: name.trim(),
        category: category.trim(),
        vendor: vendor.trim() ? vendor.trim() : null,
        reduction_percent: num(reductionPercent),
        baseline_months: Math.max(1, Math.floor(num(baselineMonths))),
      });

      setName("");
      setVendor("");
      setReductionPercent("10");
      setBaselineMonths("12");

      await loadAll();
    } catch (e: any) {
      setErr(e?.message ?? "Kunne ikke opprette tiltak");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    try {
      setErr(null);
      await deleteMeasure(id);
      await loadAll();
    } catch (e: any) {
      setErr(e?.message ?? "Kunne ikke slette tiltak");
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Tiltak</h1>
        <p className="text-sm text-slate-600">
          Tiltak kobles nå til faktura-baseline (invoice_lines) slik at du får ekte kr- og kg-sparing.
        </p>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      {/* SUMMARY */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Potensiell årlig kost-sparing</div>
          <div className="mt-1 text-xl font-semibold">{fmtNok(totals.annualSavingNok)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Potensiell årlig CO₂-sparing</div>
          <div className="mt-1 text-xl font-semibold">{fmtTon(totals.annualSavingKg)}</div>
          <div className="text-xs text-slate-500">{fmtKg(totals.annualSavingKg)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Årlig skyggegevinst (CO₂-pris)</div>
          <div className="mt-1 text-xl font-semibold">{fmtNok(totals.annualShadow)}</div>
        </div>
      </div>

      {/* CREATE */}
      <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-medium">Nytt tiltak</div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="text-xs text-slate-600">Navn</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="F.eks. Bytte til LED"
            />
          </div>

          <div>
            <label className="text-xs text-slate-600">Kategori</label>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.length === 0 && <option value="">Ingen kategorier funnet</option>}
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-slate-500">Må matche invoice_lines.category</div>
          </div>

          <div>
            <label className="text-xs text-slate-600">Vendor (valgfritt)</label>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            >
              <option value="">Alle</option>
              {vendors.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-slate-500">Filtrerer på invoices.vendor</div>
          </div>

          <div>
            <label className="text-xs text-slate-600">Reduksjon (%)</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={reductionPercent}
              onChange={(e) => setReductionPercent(e.target.value)}
              inputMode="decimal"
            />
          </div>

          <div>
            <label className="text-xs text-slate-600">Baseline (mnd)</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={baselineMonths}
              onChange={(e) => setBaselineMonths(e.target.value)}
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="mt-4">
          <button
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            onClick={onCreate}
            disabled={saving}
          >
            {saving ? "Lagrer..." : "Opprett tiltak"}
          </button>
        </div>
      </div>

      {/* LIST */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b p-4">
          <div className="text-sm font-medium">Tiltaksliste</div>
          <div className="text-xs text-slate-500">
            Hvert tiltak får baseline fra fakturaene dine (skalert til årlig).
          </div>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-slate-600">Laster…</div>
        ) : measures.length === 0 ? (
          <div className="p-4 text-sm text-slate-600">Ingen tiltak ennå.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3">Tiltak</th>
                  <th className="px-4 py-3">Filter</th>
                  <th className="px-4 py-3">Baseline (årlig)</th>
                  <th className="px-4 py-3">Sparing (årlig)</th>
                  <th className="px-4 py-3">Skygge</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {measures.map((m) => {
                  const b = baselineById[m.id];
                  return (
                    <tr key={m.id} className="border-t">
                      <td className="px-4 py-3">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-slate-500">Reduksjon: {m.reduction_percent}% • Baseline: {m.baseline_months} mnd</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs">
                          <div><span className="text-slate-500">Kategori:</span> {m.category}</div>
                          <div><span className="text-slate-500">Vendor:</span> {m.vendor ?? "Alle"}</div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {b ? (
                          <div className="text-xs">
                            <div>{fmtNok(b.annual_amount_nok)}</div>
                            <div className="text-slate-500">{fmtTon(b.annual_co2_kg)}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">Ingen baseline funnet</div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {b ? (
                          <div className="text-xs">
                            <div className="font-medium">{fmtNok(b.annual_saving_nok)}</div>
                            <div className="text-slate-500">{fmtTon(b.annual_saving_kg)}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">—</div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {b ? <div className="text-xs">{fmtNok(b.annual_shadow_saving_nok)}</div> : <div className="text-xs text-slate-500">—</div>}
                      </td>

                      <td className="px-4 py-3">
                        <button
                          className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                          onClick={() => onDelete(m.id)}
                        >
                          Slett
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="border-t p-4 text-xs text-slate-500">
              Hvis du ser “Ingen baseline funnet”: sjekk at faktura-linjene faktisk har <code className="rounded bg-slate-100 px-1">category</code> som matcher tiltakets kategori, og at <code className="rounded bg-slate-100 px-1">invoices.vendor</code> er satt hvis du bruker vendor-filter.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
