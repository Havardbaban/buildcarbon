// src/pages/Dashboard.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Aggregates = {
  invoiceCount: number;
  totalAmount: number;
  avgAmount: number;
  totalCo2Kg: number;
};

export default function DashboardPage() {
  const [data, setData] = useState<Aggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    try {
      setError(null);

      const { data, error } = await supabase
        .from("document")
        .select("id, total_amount, co2_kg");

      if (error) throw error;

      const rows = data ?? [];
      const invoiceCount = rows.length;

      const totalAmount = rows.reduce(
        (sum, r: any) => sum + (r.total_amount ?? 0),
        0
      );

      const totalCo2Kg = rows.reduce(
        (sum, r: any) => sum + (r.co2_kg ?? 0),
        0
      );

      const avgAmount =
        invoiceCount > 0 ? totalAmount / invoiceCount : 0;

      setData({
        invoiceCount,
        totalAmount,
        avgAmount,
        totalCo2Kg,
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Kunne ikke laste data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("documents-dashboard")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "document",
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      loadData();
    }, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-6">
      <header className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-600">
          Nøkkeltall basert på alle registrerte fakturaer.
        </p>
      </header>

      {loading && <div className="text-sm text-slate-500">Laster...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {data && (
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
