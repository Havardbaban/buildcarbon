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
        (sum, r: any) => sum + (r.co2_kg ?? 0),
        0
      );

      // foreløpig alt på scope 3
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

  const score =
    data && data.invoiceCount > 0
      ? computeScore(data.totalCo2 / data.invoiceCount)
      : "–";

  return (
    <div className="space-y-6">
      <header className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-semibold">ESG – utslipp</h1>
        <p className="text-sm text-slate-600">
          Foreløpig legges alle faktura-baserte utslipp på Scope 3.
        </p>
      </header>

      {loading && <div className="text-xs text-slate-500">Laster...</div>}
      {error && <div className="text-xs text-red-600">{error}</div>}

      {data && (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <ScopeCard label="Scope 1" value={data.scope1} />
            <ScopeCard label="Scope 2" value={data.scope2} />
            <ScopeCard label="Scope 3" value={data.scope3} />
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex flex-col justify-between">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                ESG-score (enkel)
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {score}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Basert på gjennomsnittlig CO₂ per faktura. Logikk kan justeres
                senere.
              </div>
            </div>
          </section>

          <section className="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
            <h2 className="text-sm font-medium mb-2">Utslipp per scope</h2>
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-600">
                  <th className="px-2 py-1 text-left">Scope</th>
                  <th className="px-2 py-1 text-right">CO₂ (kg)</th>
                </tr>
              </thead>
              <tbody>
                <ScopeRow label="Scope 1" value={data.scope1} />
                <ScopeRow label="Scope 2" value={data.scope2} />
                <ScopeRow label="Scope 3" value={data.scope3} />
                <ScopeRow label="Totalt" value={data.totalCo2} bold />
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

type ScopeCardProps = {
  label: string;
  value: number;
};

function ScopeCard({ label, value }: ScopeCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">
        {value.toLocaleString("nb-NO", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}{" "}
        kg
      </div>
    </div>
  );
}

type ScopeRowProps = {
  label: string;
  value: number;
  bold?: boolean;
};

function ScopeRow({ label, value, bold }: ScopeRowProps) {
  return (
    <tr className="border-b last:border-0">
      <td className={`px-2 py-1 ${bold ? "font-semibold" : ""}`}>{label}</td>
      <td
        className={`px-2 py-1 text-right ${
          bold ? "font-semibold text-slate-900" : ""
        }`}
      >
        {value.toLocaleString("nb-NO", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}{" "}
        kg
      </td>
    </tr>
  );
}
