import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";

type Doc = {
  id: string;
  total_amount: number | null;
  co2_kg: number | null;
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("document")
        .select("id, total_amount, co2_kg")
        .eq("org_id", ACTIVE_ORG_ID);

      if (error) {
        console.error(error);
        setError("Kunne ikke hente data til dashboard.");
      } else if (data) {
        setDocs(data as Doc[]);
      }
      setLoading(false);
    }

    load();
  }, []);

  const totalCost = docs.reduce((sum, d) => sum + (d.total_amount ?? 0), 0);
  const totalCo2 = docs.reduce((sum, d) => sum + (d.co2_kg ?? 0), 0);
  const invoiceCount = docs.length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <span className="text-xs text-slate-500">
          Org: Demo Org ({ACTIVE_ORG_ID.slice(0, 8)}…)
        </span>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p>Laster dashboard-data…</p>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl bg-white shadow p-5">
              <div className="text-xs text-slate-500">Totale kostnader</div>
              <div className="text-2xl font-bold">
                {totalCost.toLocaleString("nb-NO")} kr
              </div>
            </div>

            <div className="rounded-xl bg-white shadow p-5">
              <div className="text-xs text-slate-500">Total CO₂</div>
              <div className="text-2xl font-bold">{totalCo2.toFixed(1)} kg</div>
            </div>

            <div className="rounded-xl bg-white shadow p-5">
              <div className="text-xs text-slate-500">Antall fakturaer</div>
              <div className="text-2xl font-bold">{invoiceCount}</div>
            </div>
          </div>

          <p className="text-sm text-slate-500">
            Alle tall er filtrert på aktiv organisasjon (Demo Org).
          </p>
        </>
      )}
    </main>
  );
}
