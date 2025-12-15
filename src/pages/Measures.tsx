// src/pages/Measures.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import { fmtNok, fmtNumber, SHADOW_PRICE_PER_TONN_NOK } from "../lib/finance";

type Hotspot = {
  category: string;
  vendor: string;
  annualSpendNok: number;
  annualCo2Kg: number;
};

export default function MeasuresPage() {
  const [loading, setLoading] = useState(true);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHotspots();
  }, []);

  async function loadHotspots() {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("invoices")
        .select("vendor, amount_nok, total_co2_kg, created_at")
        .eq("org_id", ACTIVE_ORG_ID);

      if (error) throw error;

      // Group by vendor (fallback category = other)
      const map: Record<string, Hotspot> = {};

      for (const r of data ?? []) {
        const vendor = r.vendor ?? "Ukjent leverandør";
        const key = vendor;

        if (!map[key]) {
          map[key] = {
            category: "other",
            vendor,
            annualSpendNok: 0,
            annualCo2Kg: 0,
          };
        }

        map[key].annualSpendNok += r.amount_nok ?? 0;
        map[key].annualCo2Kg += r.total_co2_kg ?? 0;
      }

      // Scale to annual (roughly – assumes 12 mnd)
      const rows = Object.values(map)
        .map((r) => ({
          ...r,
          annualSpendNok: r.annualSpendNok,
          annualCo2Kg: r.annualCo2Kg,
        }))
        .filter((r) => r.annualSpendNok > 1000 || r.annualCo2Kg > 0.1)
        .sort((a, b) => b.annualCo2Kg - a.annualCo2Kg);

      setHotspots(rows);
    } catch (e: any) {
      setError(e.message ?? "Kunne ikke laste tiltak");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tiltak – hvor kan dere spare?</h1>
        <p className="text-sm text-neutral-600">
          Basert på fakturaene deres analyserer vi automatisk hvor kostnader og CO₂ kan reduseres.
        </p>
      </div>

      {loading && <div>Laster analyse…</div>}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && hotspots.length === 0 && (
        <div className="rounded-xl border bg-white p-4 text-sm text-neutral-600">
          Ingen tydelige forbedringsområder funnet ennå. Last opp flere fakturaer.
        </div>
      )}

      <div className="grid gap-4">
        {hotspots.map((h, i) => {
          const costSaving = h.annualSpendNok * 0.1;
          const co2Saving = h.annualCo2Kg * 0.1;
          const shadowSaving = (co2Saving / 1000) * SHADOW_PRICE_PER_TONN_NOK;

          return (
            <div key={i} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-lg font-semibold">{h.vendor}</div>
                  <div className="text-xs text-neutral-600">
                    Kategori: {h.category}
                  </div>
                </div>
                <div className="text-xs text-neutral-500">
                  10 % forbedringsscenario
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                <Stat label="Årlig spend" value={fmtNok(h.annualSpendNok)} />
                <Stat label="Årlig CO₂" value={`${fmtNumber(h.annualCo2Kg, 1)} t`} />
                <Stat label="Kost-sparing" value={fmtNok(costSaving)} />
                <Stat label="CO₂-sparing" value={`${fmtNumber(co2Saving, 1)} t`} />
              </div>

              <div className="mt-3 text-sm text-neutral-700">
                💡 Skyggeverdi av CO₂-reduksjon:{" "}
                <strong>{fmtNok(shadowSaving)} / år</strong>
              </div>

              <div className="mt-4 flex gap-3">
                <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">
                  Lag prosjekt
                </button>
                <button className="rounded-lg border px-4 py-2 text-sm text-neutral-600">
                  Ignorer
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
