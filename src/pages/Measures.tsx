// src/pages/Measures.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import {
  DEFAULT_REDUCTION_SCENARIOS,
  DEFAULT_CARBON_PRICES_NOK_PER_TON,
  calculateShadowScenarioSavings,
  fmtNok,
  fmtNumber,
} from "../lib/finance";

type InvoiceLite = {
  id: string;
  vendor: string;
  amountNok: number;
  co2Kg: number;
};

export default function MeasuresPage() {
  const [rows, setRows] = useState<InvoiceLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setLoading(true);

      const { data, error } = await supabase
        .from("invoices")
        .select("id, vendor, amount_nok, total_co2_kg")
        .eq("org_id", ACTIVE_ORG_ID);

      if (error) throw error;

      const mapped: InvoiceLite[] = (data ?? []).map((r: any) => ({
        id: String(r.id),
        vendor: (r.vendor ?? "Ukjent").toString().trim() || "Ukjent",
        amountNok: Number(r.amount_nok ?? 0),
        co2Kg: Number(r.total_co2_kg ?? 0),
      }));

      setRows(mapped);
    } catch (e: any) {
      setError(e?.message ?? "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("measures-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const spend = rows.reduce((s, r) => s + r.amountNok, 0);
    const co2 = rows.reduce((s, r) => s + r.co2Kg, 0);
    return { spend, co2 };
  }, [rows]);

  const scenarios = useMemo(() => {
    return calculateShadowScenarioSavings({
      totalCo2Kg: totals.co2,
      reductionScenarios: DEFAULT_REDUCTION_SCENARIOS,
      carbonPricesNokPerTon: DEFAULT_CARBON_PRICES_NOK_PER_TON,
    });
  }, [totals.co2]);

  const vendors = useMemo(() => {
    const map: Record<string, { vendor: string; spend: number; co2: number }> = {};
    for (const r of rows) {
      if (!map[r.vendor]) map[r.vendor] = { vendor: r.vendor, spend: 0, co2: 0 };
      map[r.vendor].spend += r.amountNok;
      map[r.vendor].co2 += r.co2Kg;
    }
    const list = Object.values(map);
    list.sort((a, b) => b.co2 - a.co2);
    return list;
  }, [rows]);

  if (loading) return <div className="p-6">Laster tiltak…</div>;
  if (error) return <div className="p-6 text-red-600">Feil: {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Tiltak</h1>
        <p className="text-sm text-neutral-600">
          Her viser vi “sparing” som scenario: CO₂-kutt × karbonpris (skyggekost/transition risk).
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card title="Total spend" value={fmtNok(totals.spend)} />
        <Card title="Total CO₂" value={`${fmtNumber(totals.co2, 1)} kg`} />
        <Card title="Leverandører" value={`${vendors.length}`} />
      </section>

      <section className="rounded-2xl border bg-white shadow-sm p-4 space-y-2">
        <div className="text-lg font-semibold">Sparing (scenarioanalyse)</div>
        <div className="text-sm text-neutral-600">
          Dette er <b>unngått skyggekostnad</b> (ikke garantert kontantbesparelse). Banker liker dette fordi det
          kan tolkes som “carbon liability exposure”.
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-neutral-600">
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Kutt</th>
                <th className="py-2 pr-4">CO₂-pris</th>
                <th className="py-2 pr-4">CO₂ spart</th>
                <th className="py-2 pr-4">Skygge-sparing</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s, idx) => (
                <tr key={`${s.reductionLabel}-${s.carbonPricePerTonNok}-${idx}`} className="border-b last:border-b-0">
                  <td className="py-2 pr-4">{s.reductionLabel}</td>
                  <td className="py-2 pr-4">{fmtNok(s.carbonPricePerTonNok)} / tonn</td>
                  <td className="py-2 pr-4">{fmtNumber(s.co2ReducedKg, 1)} kg</td>
                  <td className="py-2 pr-4 font-medium">{fmtNok(s.shadowSavingsNok)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm p-4 space-y-2">
        <div className="text-lg font-semibold">Top leverandører (drivere)</div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-neutral-600">
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Leverandør</th>
                <th className="py-2 pr-4">CO₂ (kg)</th>
                <th className="py-2 pr-4">Spend (NOK)</th>
                <th className="py-2 pr-4">g CO₂ / NOK</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const intensity = v.spend > 0 ? (v.co2 * 1000) / v.spend : 0;
                return (
                  <tr key={v.vendor} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">{v.vendor}</td>
                    <td className="py-2 pr-4">{fmtNumber(v.co2, 1)}</td>
                    <td className="py-2 pr-4">{fmtNok(v.spend)}</td>
                    <td className="py-2 pr-4">{fmtNumber(intensity, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4">
      <div className="text-sm text-neutral-600">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
