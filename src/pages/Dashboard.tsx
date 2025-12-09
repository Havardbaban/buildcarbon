// src/pages/Dashboard.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";

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
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("document")
        .select("id, total_amount, co2_kg")
        .eq("org_id", ACTIVE_ORG_ID);

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
    // 1) Last data ved første render
    loadData();

    // 2) Realtime: last på nytt når det kommer nye dokument-rader
    const channel = supabase
      .channel("documents-dashboard")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "document",
          filter: `org_id=eq.${ACTIVE_ORG_ID}`,
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-gray-600">
          Enkel oversikt over fakturaer og kostnader.
        </p>
      </header>

      {loading && <div>Laster...</div>}
      {error && <div className="text-red-600">{error}</div>}

      {data && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
        </div>
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
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}
