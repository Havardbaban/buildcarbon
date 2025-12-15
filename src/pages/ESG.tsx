// src/pages/ESG.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import { calculateFinanceMetrics, SHADOW_PRICE_PER_TONN_NOK } from "../lib/finance";

type Row = {
  id: string;
  vendor: string;
  amountNok: number;
  co2Kg: number;
  scope: string | null;
};

function parseMoneyToNumber(input: unknown): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === "number" && Number.isFinite(input)) return input;

  // håndter "1 115,42", "599,44", "1.115,42", "NOK 599,44", etc.
  const s = String(input)
    .replace(/\s/g, "")
    .replace(/kr|nok|nkr|,-/gi, "")
    .trim();

  if (!s) return 0;

  // norsk format -> js float: 1.234,56 -> 1234.56
  const normalized = s.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function toNumber(input: unknown): number {
  if (input === null || input === undefined) return 0;
  if (typeof input === "number" && Number.isFinite(input)) return input;
  const n = Number(input);
  return Number.isFinite(n) ? n : 0;
}

function fmtNok(n: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtNumber(n: number, digits = 0) {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: digits,
  }).format(n);
}

export default function ESGPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setLoading(true);

      // ✅ Viktig: vi velger bare kolonner vi forventer finnes
      // Hvis du VET at du har total_amount/amount_nok/total_nok, kan du legge de inn.
      const { data, error } = await supabase
        .from("invoices")
        .select("id, vendor, total, total_co2_kg, scope")
        .eq("org_id", ACTIVE_ORG_ID);

      if (error) throw error;

      const mapped: Row[] = (data ?? []).map((r: any) => {
        const vendor = (r.vendor ?? "Ukjent").toString().trim() || "Ukjent";

        // Beløp: her bruker vi "total" (standard hos dere).
        // Hvis du har beløpet i en annen kolonne, si hva den heter så oppdaterer jeg.
        const amountNok = parseMoneyToNumber(r.total);

        const co2Kg = toNumber(r.total_co2_kg);
        const scope = (r.scope ?? null) as string | null;

        return {
          id: String(r.id),
          vendor,
          amountNok,
          co2Kg,
          scope,
        };
      });

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
      .channel("esg-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = useMemo(() => {
    const base = rows.map((r) => ({
      total: r.amountNok,
      total_co2_kg: r.co2Kg,
    }));
    return calculateFinanceMetrics(base);
  }, [rows]);

  const vendorTable = useMemo(() => {
    const map: Record<
      string,
      { vendor: string; co2Kg: number; spendNok: number; intensity: number }
    > = {};

    for (const r of rows) {
      const key = r.vendor;
      if (!map[key]) map[key] = { vendor: key, co2Kg: 0, spendNok: 0, intensity: 0 };
      map[key].co2Kg += r.co2Kg;
      map[key].spendNok += r.amountNok;
    }

    const list = Object.values(map).map((v) => ({
      ...v,
      intensity: v.spendNok > 0 ? (v.co2Kg * 1000) / v.spendNok : 0, // g/NOK
    }));

    list.sort((a, b) => b.co2Kg - a.co2Kg);
    return list;
  }, [rows]);

  if (loading) return <div className="p-6">Laster ESG…</div>;
  if (error) return <div className="p-6 text-red-600">Feil: {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">ESG & finans – oversikt</h1>
        <p className="text-sm text-neutral-600">
          Basert på fakturaer i Scope 3 (leverandørkjeden). Vi kobler CO₂-utslipp til kroner
          for å vise finansiell klimarisiko.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard title="Totale innkjøp (NOK)" value={fmtNok(metrics.totalSpendNok)} />
        <StatCard title="Totalt CO₂-avtrykk (kg)" value={fmtNumber(metrics.totalCo2Kg, 1)} />
        <StatCard
          title="CO₂-intensitet (g / NOK)"
          value={fmtNumber(metrics.carbonIntensityPerNokGram, 1)}
        />
        <StatCard
          title={`Skyggekostnad (NOK) – ${fmtNumber(SHADOW_PRICE_PER_TONN_NOK)} kr/tCO₂e`}
          value={fmtNok(metrics.carbonShadowCostNok)}
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-white shadow-sm p-4">
          <div className="text-sm text-neutral-600">
            CO₂ per MNOK (tonn CO₂e / MNOK innkjøp)
          </div>
          <div className="text-2xl font-semibold">
            {fmtNumber(metrics.co2PerMillionNokTonnes, 2)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white shadow-sm p-4">
          <div className="text-sm font-medium">Forklaring</div>
          <ul className="mt-2 text-sm text-neutral-700 space-y-1 list-disc ml-5">
            <li>
              <b>CO₂-intensitet (g/NOK)</b> viser hvor mye utslipp dere indirekte kjøper per krone
              i leverandørkjeden (Scope 3).
            </li>
            <li>
              <b>CO₂ per MNOK</b> er tonn CO₂ per 1 million kroner innkjøp – brukes ofte av banker og
              ESG-analytikere.
            </li>
            <li>
              <b>Skyggekostnad</b> er en intern beregnet kostnad hvis dere priser CO₂ til{" "}
              {fmtNumber(SHADOW_PRICE_PER_TONN_NOK)} kr/tCO₂e.
            </li>
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border bg-white shadow-sm p-4">
        <div className="text-lg font-semibold">Scope 3 – leverandører (sortert på høyest CO₂)</div>
        <div className="text-sm text-neutral-600">
          Brukes til å identifisere hvilke leverandører som påvirker både klima og finansielt fotavtrykk mest.
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-neutral-600">
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Leverandør</th>
                <th className="py-2 pr-4">CO₂ (kg)</th>
                <th className="py-2 pr-4">Innkjøp (NOK)</th>
                <th className="py-2 pr-4">g CO₂ / NOK</th>
              </tr>
            </thead>
            <tbody>
              {vendorTable.map((v) => (
                <tr key={v.vendor} className="border-b last:border-b-0">
                  <td className="py-2 pr-4 font-medium">{v.vendor}</td>
                  <td className="py-2 pr-4">{fmtNumber(v.co2Kg, 1)}</td>
                  <td className="py-2 pr-4">{fmtNok(v.spendNok)}</td>
                  <td className="py-2 pr-4">{fmtNumber(v.intensity, 1)}</td>
                </tr>
              ))}
              {vendorTable.length === 0 && (
                <tr>
                  <td className="py-3 text-neutral-600" colSpan={4}>
                    Ingen fakturaer funnet for denne organisasjonen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-neutral-500">
          Hvis beløp fortsatt vises feil: sjekk at beløpet ligger i kolonnen <code>total</code> i{" "}
          <code>invoices</code>.
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4">
      <div className="text-sm text-neutral-600">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
