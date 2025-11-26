import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";

type Doc = {
  id: string;
  supplier_name: string | null;
  total_amount: number | null;
  co2_kg: number | null;
  energy_kwh: number | null;
};

type SupplierAgg = {
  supplier: string;
  cost: number;
  co2: number;
  energy: number;
};

export default function Measures() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("document")
        .select("id, supplier_name, total_amount, co2_kg, energy_kwh")
        .eq("org_id", ACTIVE_ORG_ID);

      if (error) {
        console.error(error);
        setError("Kunne ikke hente data til tiltak.");
      } else if (data) {
        setDocs(data as Doc[]);
      }
      setLoading(false);
    }

    load();
  }, []);

  const totalCost = docs.reduce((sum, d) => sum + (d.total_amount ?? 0), 0);
  const totalCo2 = docs.reduce((sum, d) => sum + (d.co2_kg ?? 0), 0);
  const totalEnergy = docs.reduce((sum, d) => sum + (d.energy_kwh ?? 0), 0);

  const perSupplier: SupplierAgg[] = Object.values(
    docs.reduce((acc: Record<string, SupplierAgg>, d) => {
      const name = d.supplier_name ?? "Ukjent leverandør";
      if (!acc[name]) {
        acc[name] = { supplier: name, cost: 0, co2: 0, energy: 0 };
      }
      acc[name].cost += d.total_amount ?? 0;
      acc[name].co2 += d.co2_kg ?? 0;
      acc[name].energy += d.energy_kwh ?? 0;
      return acc;
    }, {})
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tiltak & potensial</h1>
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
        <p>Laster tiltak…</p>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl bg-white shadow p-5">
              <div className="text-xs text-slate-500">Årlige kostnader (fra fakturaer)</div>
              <div className="text-2xl font-bold">
                {totalCost.toLocaleString("nb-NO")} kr
              </div>
            </div>
            <div className="rounded-xl bg-white shadow p-5">
              <div className="text-xs text-slate-500">Årlig CO₂</div>
              <div className="text-2xl font-bold">{totalCo2.toFixed(1)} kg</div>
            </div>
            <div className="rounded-xl bg-white shadow p-5">
              <div className="text-xs text-slate-500">Årlig energibruk</div>
              <div className="text-2xl font-bold">
                {totalEnergy.toFixed(0)} kWh
              </div>
            </div>
          </div>

          <section>
            <h2 className="text-lg font-semibold mt-6 mb-2">
              Leverandører med høyest forbruk
            </h2>
            <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Leverandør</th>
                    <th className="px-3 py-2 text-left">Kostnad (kr)</th>
                    <th className="px-3 py-2 text-left">CO₂ (kg)</th>
                    <th className="px-3 py-2 text-left">Energibruk (kWh)</th>
                    <th className="px-3 py-2 text-left">Anbefalt tiltak</th>
                  </tr>
                </thead>
                <tbody>
                  {perSupplier.map((s) => (
                    <tr key={s.supplier} className="border-b last:border-0">
                      <td className="px-3 py-2">{s.supplier}</td>
                      <td className="px-3 py-2">
                        {s.cost.toLocaleString("nb-NO")}
                      </td>
                      <td className="px-3 py-2">{s.co2.toFixed(1)}</td>
                      <td className="px-3 py-2">{s.energy.toFixed(0)}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {s.energy > 0
                          ? "Vurder energieffektivisering / avtaleoptimalisering"
                          : "Begrenset energidata – last opp flere energifakturaer"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
