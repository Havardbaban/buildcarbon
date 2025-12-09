// src/pages/ESG.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";

type ESGData = {
  scope1: number;
  scope2: number;
  scope3: number;
  totalCo2: number;
  invoiceCount: number;
};

function computeScore(totalPerInvoice: number): string {
  // VELDIG enkel score-logikk, kan justeres:
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

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("document")
          .select("id, co2_kg")
          .eq("org_id", ACTIVE_ORG_ID);

        if (error) throw error;

        const rows = data ?? [];
        const invoiceCount = rows.length;

        const totalCo2 = rows.reduce(
          (sum, r: any) => sum + (r.co2_kg ?? 0),
          0
        );

        // Midlertidig: alt på scope 3 inntil vi har kategorier
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

    load();
  }, []);

  const score =
    data && data.invoiceCount > 0
      ? computeScore(data.totalCo2 / data.invoiceCount)
      : "–";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">ESG – utslipp</h1>
        <p className="text-sm text-gray-600">
          Scope 1–3 basert på registrerte fakturaer (foreløpig alt på scope 3).
        </p>
      </header>

      {loading && <div>Laster...</div>}
      {error && <div className="text-red-600">{error}</div>}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <ScopeCard label="Scope 1" value={data.scope1} />
            <ScopeCard label="Scope 2" value={data.scope2} />
            <ScopeCard label="Scope 3" value={data.scope3} />
            <div className="border rounded-lg p-4 bg-white shadow-sm flex flex-col justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  ESG-score (enkel)
                </div>
                <div className="mt-2 text-3xl font-semibold">{score}</div>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Basert på gjennomsnittlig CO₂ per faktura. Logikken kan
                justeres senere.
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-white shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Total CO₂
            </div>
            <div className="mt-2 text-xl font-semibold">
              {data.totalCo2.toLocaleString("nb-NO", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}{" "}
              kg
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Basert på {data.invoiceCount.toLocaleString("nb-NO")} fakturaer.
            </div>
          </div>
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
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold">
        {value.toLocaleString("nb-NO", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}{" "}
        kg
      </div>
    </div>
  );
}
