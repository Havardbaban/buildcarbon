// src/pages/Dashboard.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Row = {
  id: string;
  issue_date: string | null;
  supplier_name: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
};

type Aggregates = {
  invoiceCount: number;
  totalAmount: number;
  avgAmount: number;
  totalCo2Kg: number;
  latest: Row[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Aggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setLoading(true);

      const { data, error } = await supabase
        .from("document")
        .select("id, issue_date, supplier_name, total_amount, currency, co2_kg")
        .order("issue_date", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as Row[];
      const invoiceCount = rows.length;

      const totalAmount = rows.reduce(
        (sum, r) => sum + (r.total_amount ?? 0),
        0
      );
      const totalCo2Kg = rows.reduce(
        (sum, r) => sum + (r.co2_kg ?? 0),
        0
      );
      const avgAmount =
        invoiceCount > 0 ? totalAmount / invoiceCount : 0;

      setData({
        invoiceCount,
        totalAmount,
        avgAmount,
        totalCo2Kg,
        latest: rows.slice(0, 5),
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Kunne ikke laste dashboard-data.");
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

  return (
    <div className="space-y-6">
      <header className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-600">
          Nøkkeltall og siste fakturaer.
        </p>
      </header>

      {loading && <div className="text-xs text-slate-500">Laster...</div>}
      {error && <div className="text-xs text-red-600">{error}</div>}

      {data && (
        <>
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Antall fakturaer"
              value={data.invoiceCount.toLocaleString("nb-NO")}
            />
            <StatCard
              label="Totalt beløp (NOK)"
              value={data.totalAmount.toLocaleString("nb-NO", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            />
            <StatCard
              label="Snitt per faktura (NOK)"
              value={data.avgAmount.toLocaleString("nb-NO", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            />
            <StatCard
              label="Total CO₂ (kg)"
              value={data.totalCo2Kg.toLocaleString("nb-NO", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            />
          </section>

          <section className="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
            <h2 className="text-sm font-medium mb-2">Siste fakturaer</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-600">
                    <th className="px-2 py-1 text-left">Dato</th>
                    <th className="px-2 py-1 text-left">Leverandør</th>
                    <th className="px-2 py-1 text-right">Beløp</th>
                    <th className="px-2 py-1 text-right">CO₂ (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.latest.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-2 py-1">
                        {r.issue_date
                          ? new Date(r.issue_date).toLocaleDateString(
                              "nb-NO"
                            )
                          : "–"}
                      </td>
                      <td className="px-2 py-1">
                        {r.supplier_name ?? "Ukjent leverandør"}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {r.total_amount != null
                          ? r.total_amount.toLocaleString("nb-NO", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }) +
                            " " +
                            (r.currency || "NOK")
                          : "–"}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {r.co2_kg != null
                          ? r.co2_kg.toLocaleString("nb-NO", {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })
                          : "–"}
                      </td>
                    </tr>
                  ))}
                  {data.latest.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-2 py-4 text-center text-slate-400"
                      >
                        Ingen fakturaer ennå.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: string;
};

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex flex-col justify-between">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">
        {value}
      </div>
    </div>
  );
}
