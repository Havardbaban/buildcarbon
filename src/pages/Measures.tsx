// src/pages/Measures.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Hotspot = {
  supplier: string;
  co2: number;
  amount: number;
};

export default function MeasuresPage() {
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setLoading(true);

      const { data, error } = await supabase
        .from("document")
        .select("supplier_name, total_amount, co2_kg");

      if (error) throw error;

      const map: Record<string, Hotspot> = {};
      for (const r of data ?? []) {
        const supplier = r.supplier_name ?? "Ukjent leverandør";
        if (!map[supplier]) map[supplier] = { supplier, co2: 0, amount: 0 };
        map[supplier].co2 += r.co2_kg ?? 0;
        map[supplier].amount += r.total_amount ?? 0;
      }

      const arr = Object.values(map).sort((a, b) => b.co2 - a.co2);
      setHotspots(arr);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Kunne ikke laste tiltak.");
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
        <h1 className="text-2xl font-semibold">Tiltak</h1>
        <p className="text-sm text-slate-600">
          Enkle forslag basert på hvilke leverandører som gir mest utslipp.
        </p>
      </header>

      {loading && <div className="text-sm text-slate-500">Laster...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      <section className="space-y-4">
        {hotspots.slice(0, 10).map((h) => {
          const potential = h.co2 * 0.3; // si at 30 % reduksjon er mulig
          return (
            <div
              key={h.supplier}
              className="rounded-xl border border-slate-200 bg-white shadow-sm p-4"
            >
              <div className="flex justify-between">
                <div>
                  <h2 className="text-sm font-semibold">{h.supplier}</h2>
                  <p className="text-xs text-s

late-500">
                    Utslipp:{" "}
                    {h.co2.toLocaleString("nb-NO", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    kg CO₂ &middot; Kostnad:{" "}
                    {h.amount.toLocaleString("nb-NO", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    NOK
                  </p>
                </div>
                <div className="text-right text-xs">
                  <div className="text-slate-500">Potensiell reduksjon</div>
                  <div className="text-emerald-700 font-semibold">
                    {potential.toLocaleString("nb-NO", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    kg CO₂
                  </div>
                </div>
              </div>
              <ul className="mt-2 text-xs text-slate-600 list-disc list-inside space-y-1">
                <li>Forhandle ny avtale eller pris med leverandør.</li>
                <li>Be om grønnere produkter/tjenester (fornybar energi, transport, osv.).</li>
                <li>Vurder alternative leverandører med lavere utslipp.</li>
              </ul>
            </div>
          );
        })}
        {!loading && hotspots.length === 0 && (
          <div className="text-xs text-slate-400">
            Ingen data ennå. Last opp noen fakturaer først.
          </div>
        )}
      </section>
    </div>
  );
}
