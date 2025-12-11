// src/pages/ESG.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import { calculateESGScore } from "../lib/emissions";

type InvoiceRow = {
  id: string;
  invoice_date: string | null;
  amount_nok: number | null;
  total_co2_kg: number | null;
  scope: string | null;
  vendor: string | null;
};

type ScopeKey = "Scope 1" | "Scope 2" | "Scope 3" | "Unknown";

type ScopeTotals = {
  scope: ScopeKey;
  co2: number;
  amount: number;
};

type Scope3Vendor = {
  vendor: string;
  co2: number;
  amount: number;
  shareOfScope3: number; // 0–1
};

export default function ESGPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load invoices for active org
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function load() {
      try {
        setError(null);
        setLoading(true);

        const { data, error } = await supabase
          .from("invoices")
          .select(
            "id, invoice_date, amount_nok, total_co2_kg, scope, vendor"
          )
          .eq("org_id", ACTIVE_ORG_ID)
          .order("created_at", { ascending: false })
          .limit(500);

        if (error) throw error;
        setRows((data ?? []) as InvoiceRow[]);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Kunne ikke hente ESG-data.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // ---------------------------------------------------------------------------
  // Aggregate statistics
  // ---------------------------------------------------------------------------
  const {
    totalCo2,
    totalSpend,
    invoiceCount,
    byScope,
    scopeWithMostEmissions,
  } = useMemo(() => {
    let totalCo2 = 0;
    let totalSpend = 0;
    let invoiceCount = rows.length;

    const initScope = (): ScopeTotals[] => [
      { scope: "Scope 1", co2: 0, amount: 0 },
      { scope: "Scope 2", co2: 0, amount: 0 },
      { scope: "Scope 3", co2: 0, amount: 0 },
      { scope: "Unknown", co2: 0, amount: 0 },
    ];

    const byScopeMap = new Map<ScopeKey, ScopeTotals>();
    for (const s of ["Scope 1", "Scope 2", "Scope 3", "Unknown"] as ScopeKey[]) {
      byScopeMap.set(s, { scope: s, co2: 0, amount: 0 });
    }

    for (const row of rows) {
      const co2 = row.total_co2_kg ?? 0;
      const amount = row.amount_nok ?? 0;

      totalCo2 += co2;
      totalSpend += amount;

      let scopeKey: ScopeKey = "Unknown";
      const s = (row.scope ?? "").toLowerCase();
      if (s.includes("1")) scopeKey = "Scope 1";
      else if (s.includes("2")) scopeKey = "Scope 2";
      else if (s.includes("3")) scopeKey = "Scope 3";

      const bucket = byScopeMap.get(scopeKey)!;
      bucket.co2 += co2;
      bucket.amount += amount;
    }

    const byScope = Array.from(byScopeMap.values());
    const scopeWithMostEmissions =
      byScope.slice().sort((a, b) => b.co2 - a.co2)[0] ?? null;

    return {
      totalCo2,
      totalSpend,
      invoiceCount,
      byScope,
      scopeWithMostEmissions,
    };
  }, [rows]);

  const esgScore = useMemo(
    () => calculateESGScore(totalCo2, totalSpend),
    [totalCo2, totalSpend]
  );

  // ---------------------------------------------------------------------------
  // Scope 3 vendor aggregation
  // ---------------------------------------------------------------------------
  const scope3Vendors: Scope3Vendor[] = useMemo(() => {
    const vendorMap = new Map<string, { vendor: string; co2: number; amount: number }>();

    for (const row of rows) {
      const s = (row.scope ?? "").toLowerCase();
      const isScope3 = s.includes("3"); // catch "Scope 3" or "scope3" etc.

      if (!isScope3) continue;
      if (!row.vendor) continue;

      const key = row.vendor;
      const entry =
        vendorMap.get(key) ||
        { vendor: key, co2: 0, amount: 0 };

      entry.co2 += row.total_co2_kg ?? 0;
      entry.amount += row.amount_nok ?? 0;
      vendorMap.set(key, entry);
    }

    const list = Array.from(vendorMap.values());
    const totalScope3Co2 = list.reduce((sum, v) => sum + v.co2, 0);

    return list
      .map((v) => ({
        ...v,
        shareOfScope3: totalScope3Co2 > 0 ? v.co2 / totalScope3Co2 : 0,
      }))
      .sort((a, b) => b.co2 - a.co2);
  }, [rows]);

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  return (
    <div className="px-6 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">ESG &amp; utslipp</h1>
        <p className="text-sm text-slate-500">
          Vi beregner CO₂ fra fakturaene dine og gir en enkel ESG-score (miljø).
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            ESG-score (miljø)
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {isNaN(esgScore) ? "–" : Math.round(esgScore)}
            <span className="text-base font-normal text-slate-500"> / 100</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Basert på kg CO₂ per krone brukt.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total CO₂
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {totalCo2.toFixed(1)}{" "}
            <span className="text-base font-normal text-slate-500">kg</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Basert på {invoiceCount} fakturaer.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Scope med høyest utslipp
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {scopeWithMostEmissions ? scopeWithMostEmissions.scope : "Unknown"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Fokuser tiltak her for størst effekt.
          </p>
        </div>
      </section>

      {/* Scope totals table */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-900">
            Utslipp per scope
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Scope
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  CO₂ (kg)
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  % av total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {byScope.map((row) => {
                const share = totalCo2 > 0 ? (row.co2 / totalCo2) * 100 : 0;
                return (
                  <tr key={row.scope}>
                    <td className="px-4 py-2 text-sm text-slate-700">
                      {row.scope}
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-slate-700">
                      {row.co2.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-slate-700">
                      {share.toFixed(1)} %
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Scope 3 vendors */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-slate-900">
              Viktige leverandører i Scope 3
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Aggregert på leverandør for fakturaer som er klassifisert som
              Scope 3.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Leverandør
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  CO₂ (kg)
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  % av Scope 3
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Beløp (NOK)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {scope3Vendors.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-3 text-center text-sm text-slate-500"
                  >
                    Ingen Scope 3-fakturaer med registrert leverandør ennå.
                  </td>
                </tr>
              )}
              {scope3Vendors.map((v) => (
                <tr key={v.vendor}>
                  <td className="px-4 py-2 text-sm text-slate-700">
                    {v.vendor}
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-slate-700">
                    {v.co2.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-slate-700">
                    {(v.shareOfScope3 * 100).toFixed(1)} %
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-slate-700">
                    {v.amount.toLocaleString("nb-NO", {
                      maximumFractionDigits: 0,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {loading && (
        <p className="text-xs text-slate-400">Laster ESG-data …</p>
      )}
    </div>
  );
}
