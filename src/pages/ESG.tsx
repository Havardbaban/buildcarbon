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

  async function loadData() {
    try {
      setError(null);

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
    loadData();

    const channel = supabase
      .channel("documents-esg")
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

      {loading && <div className="text-sm text-slate-500">Laster...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

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
                Basert på gjennomsnittlig CO₂ per faktura. Logikken kan
                justeres senere.
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
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
