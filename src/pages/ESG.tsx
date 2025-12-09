// src/pages/ESG.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type ESGData = {
  scope1: number;
  scope2: number;
  scope3: number;
  totalCo2: number;
  invoiceCount: number;
};

function computeScore(totalPerInvoice: number): string {
  if (totalPerInvoice < 50) return "A";
  if (totalPerInvoice < 150) return "B";
  if (totalPerInvoice < 300) return "C";
  if (totalPerInvoice < 600) return "D";
  return "E";
}

export default function ESGPage() {
  const [data, setData] = useState<ESGData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setLoading(true);

      const { data, error } = await supabase
        .from("document")
        .select("id, co2_kg");

      if (error) throw error;

      const rows = data ?? [];
      const invoiceCount = rows.length;
      const totalCo2 = rows.reduce(
        (s: number, r: any) => s + (r.co2_kg ?? 0),
        0
      );

      // foreløpig: alt på scope 3
      const scope1 = 0;
      const scope2 = 0;
      const scope3 = totalCo2;

      setData({ scope1, scope2, scope3, totalCo2, invoiceCount });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Kunne ikke laste ESG-data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("invoice:updated", handler);
    return () => window.removeEventListener("invoice:updated", handler);
  }, []);

  if (loading) {
    return <div className="text-sm text-slate-500">Laster ESG-data...</div>;
  }

  if (!data) {
    return <div className="text-sm text-red-600">Ingen ESG-data.</div>;
  }

  const score =
    data.invoiceCount > 0
      ? computeScore(data.totalCo2 / data.invoiceCount)
      : "-";

  const maxScope = Math.max(data.scope1, data.scope2, data.scope3, 1);

  return (
    <div className="space-y-6">
      <header className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-semibold">ESG &amp; utslipp</h1>
        <p className="text-sm text-slate-600">
          Foreløpig legges alle faktura-baserte utslipp på Scope 3. Vi kan
          senere fordele mellom Scope 1–2–3 basert på type kostnad.
        </p>
      </header>

      {/* Score + total */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            ESG-score (enkel)
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {score}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Basert på gjennomsnittlig CO₂ per faktura.
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Total CO₂
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {data.totalCo2.toLocaleString("nb-NO", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            })}{" "}
            kg
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Basert på {data.invoiceCount.toLocaleString("nb-NO")} fakturaer.
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Scope med høyest utslipp
          </div>
          <div className="mt-2 text-xl font-semibold text-slate-900">
            Scope 3
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Når vi begynner å splitte på Scope 1 og 2, vil dette feltet vise
            hvilket scope som dominerer.
          </div>
        </div>
      </section>

      {/* Tabell + figurer per scope */}
      <section className="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
        <h2 className="text-sm font-semibold mb-3">Utslipp per scope</h2>
        <table className="min-w-full text-xs mb-3">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left border-b">Scope</th>
              <th className="px-2 py-1 text-right border-b">CO₂ (kg)</th>
            </tr>
          </thead>
          <tbody>
            {(["scope1", "scope2", "scope3"] as const).map((s) => (
              <tr key={s} className="border-b last:border-0">
                <td className="px-2 py-1">
                  {s === "scope1" ? "Scope 1" : s === "scope2" ? "Scope 2" : "Scope 3"}
                </td>
                <td className="px-2 py-1 text-right">
                  {data[s].toLocaleString("nb-NO", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{" "}
                  kg
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* "Figur": barer per scope */}
        <div className="space-y-2">
          {(["scope1", "scope2", "scope3"] as const).map((s) => (
            <div key={s}>
              <div className="flex justify-between text-xs mb-1">
                <span>
                  {s === "scope1"
                    ? "Scope 1"
                    : s === "scope2"
                    ? "Scope 2"
                    : "Scope 3"}
                </span>
                <span>
                  {data[s].toLocaleString("nb-NO", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  kg
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600"
                  style={{
                    width: `${(data[s] / maxScope) * 100 || 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
