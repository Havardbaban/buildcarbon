// src/pages/Dashboard.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Row = {
  id: string;
  supplier_name: string | null;
  issue_date: string | null;
  total_amount: number | null;
  co2_kg: number | null;
};

type Aggregates = {
  invoiceCount: number;
  totalAmount: number;
  avgAmount: number;
  totalCo2: number;
  perSupplier: { supplier: string; co2: number; amount: number }[];
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
        .select("id, supplier_name, issue_date, total_amount, co2_kg");

      if (error) throw error;

      const rows = (data ?? []) as Row[];
      const invoiceCount = rows.length;
      const totalAmount = rows.reduce(
        (s, r) => s + (r.total_amount ?? 0),
        0
      );
      const totalCo2 = rows.reduce((s, r) => s + (r.co2_kg ?? 0), 0);
      const avgAmount =
        invoiceCount > 0 ? totalAmount / invoiceCount : 0;

      // Aggreger per leverandør
      const map: Record<
        string,
        { supplier: string; co2: number; amount: number }
      > = {};
      for (const r of rows) {
        const key = r.supplier_name ?? "Ukjent leverandør";
        if (!map[key]) map[key] = { supplier: key, co2: 0, amount: 0 };
        map[key].co2 += r.co2_kg ?? 0;
        map[key].amount += r.total_amount ?? 0;
      }
      const perSupplier = Object.values(map).sort(
        (a, b) => b.co2 - a.co2
      );

      setData({
        invoiceCount,
        totalAmount,
        avgAmount,
        totalCo2,
        perSupplier,
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

  if (loading) {
    return <div className="text-sm text-slate-500">Laster dashboard...</div>;
  }

  if (!data) {
    return <div className="text-sm text-red-600">Ingen data.</div>;
  }

  const maxCo2 =
    data.perSupplier.length > 0
      ? Math.max(...data.perSupplier.map((x) => x.co2))
      : 1;

  return (
    <div className="space-y-6">
      <header className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-600">
          Oversikt over kostnader og utslipp basert på fakturaene.
        </p>
      </header>

      {/* KPI-kort */}
      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard
          label="Antall fakturaer"
          value={data.invoiceCount.toLocaleString("nb-NO")}
        />
        <KpiCard
          label="Totalt beløp (NOK)"
          value={data.totalAmount.toLocaleString("nb-NO", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        />
        <KpiCard
          label="Snitt per faktura (NOK)"
          value={data.avgAmount.toLocaleString("nb-NO", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        />
        <KpiCard
          label="Total CO₂ (kg)"
          value={data.totalCo2.toLocaleString("nb-NO", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
        />
      </section>

      {/* "Figur": leverandører med horisontale barer */}
      <section className="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
        <h2 className="text-sm font-semibold mb-3">
          Hotspots – leverandører med høyest utslipp
        </h2>
        <div className="space-y-2">
          {data.perSupplier.slice(0, 8).map((s) => (
            <div key={s.supplier}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium">{s.supplier}</span>
                <span>
                  {s.co2.toLocaleString("nb-NO", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  kg CO₂
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600"
                  style={{
                    width: `${(s.co2 / maxCo2) * 100 || 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
          {data.perSupplier.length === 0 && (
            <div className="text-xs text-slate-400">
              Ingen data ennå. Last opp en faktura.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">
        {value}
      </div>
    </div>
  );
}
