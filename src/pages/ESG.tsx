// src/pages/ESG.tsx

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import {
  calculateFinanceMetrics,
  FinanceMetrics,
  SHADOW_PRICE_PER_TONN_NOK,
} from "../lib/finance";

type InvoiceRow = {
  id: string;
  invoice_date: string;
  vendor: string | null;
  total: number | null;         // NOK-beløp (din kolonne)
  total_co2_kg: number | null;
  scope: string | null;
};

export default function ESGPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!isMounted) return;

      setLoading(true);
      setError(null);

      try {
        const { data, error } = await supabase
          .from("invoices")
          .select("id, invoice_date, vendor, total, total_co2_kg, scope")
          .eq("org_id", ACTIVE_ORG_ID)
          .order("invoice_date", { ascending: false })
          .limit(500);

        if (error) {
          console.error(error);
          if (!isMounted) return;
          setError("Kunne ikke hente fakturaer.");
          setRows([]);
          return;
        }

        if (!isMounted) return;
        setRows((data ?? []) as InvoiceRow[]);
      } catch (err: any) {
        console.error(err);
        if (!isMounted) return;
        setError("Ukjent feil ved henting av faktura-data.");
        setRows([]);
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    }

    // 1) Først: initial load
    load();

    // 2) Så: abonnér på endringer i invoices for aktiv org (INSERT/UPDATE/DELETE)
    const channel = supabase
      .channel(`invoices-realtime-esg-${ACTIVE_ORG_ID}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
          filter: `org_id=eq.${ACTIVE_ORG_ID}`,
        },
        () => {
          // Når noe endres (inkl. "slett alle") → hent data på nytt
          load();
        }
      )
      .subscribe((status) => {
        console.log("ESG realtime status:", status);
      });

    return () => {
      // Cleanup når komponenten unmountes
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const finance: FinanceMetrics = useMemo(
    () => calculateFinanceMetrics(rows),
    [rows]
  );

  // Enkel gruppering på leverandør for Scope 3
  const vendorSummary = useMemo(() => {
    const map = new Map<
      string,
      { vendor: string; totalCo2Kg: number; totalSpendNok: number }
    >();

    for (const row of rows) {
      const vendor = row.vendor ?? "Ukjent leverandør";
      const current = map.get(vendor) ?? {
        vendor,
        totalCo2Kg: 0,
        totalSpendNok: 0,
      };

      current.totalCo2Kg += row.total_co2_kg ?? 0;
      current.totalSpendNok += row.total ?? 0;

      map.set(vendor, current);
    }

    return Array.from(map.values()).sort(
      (a, b) => b.totalCo2Kg - a.totalCo2Kg
    );
  }, [rows]);

  return (
    <div className="space-y-8">
      <header className="pb-4 border-b border-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900">
          ESG &amp; finans – oversikt
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Basert på fakturaer i Scope 3 (leverandørkjeden). Vi kobler
          CO₂-utslipp til kroner for å vise finansiell klimarisko.
        </p>
      </header>

      {loading && (
        <p className="text-sm text-slate-500">Laster data…</p>
      )}

      {error && (
        <p className="text-sm text-red-600">
          {error}
        </p>
      )}

      {!loading && !error && (
        <>
          {/* Nøkkeltall-kort */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Totale innkjøp (NOK)"
              value={finance.totalSpendNok}
              format="currency"
            />
            <StatCard
              label="Totalt CO₂-avtrykk (kg)"
              value={finance.totalCo2Kg}
              decimals={0}
            />
            <StatCard
              label="CO₂-intensitet (g / NOK)"
              value={finance.carbonIntensityPerNokGram}
              decimals={1}
            />
            <StatCard
              label={`Skyggekostnad (NOK) – ${SHADOW_PRICE_PER_TONN_NOK.toLocaleString(
                "nb-NO"
              )} kr/tCO₂e`}
              value={finance.carbonShadowCostNok}
              format="currency"
            />
          </section>

          {/* Litt mer detaljer */}
          <section className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="CO₂ per MNOK (tonn CO₂e / MNOK innkjøp)"
              value={finance.co2PerMillionNokTonnes}
              decimals={2}
            />
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Forklaring
              </h2>
              <p className="mt-2 text-xs text-slate-600 space-y-1">
                <span className="block">
                  • <strong>CO₂-intensitet (g/NOK)</strong> viser hvor
                  mye utslipp dere indirekte kjøper per krone i
                  leverandørkjeden (Scope 3).
                </span>
                <span className="block">
                  • <strong>CO₂ per MNOK</strong> er tonn CO₂ per 1
                  million kroner innkjøp – brukes ofte av banker og
                  ESG-analytikere.
                </span>
                <span className="block">
                  • <strong>Skyggekostnad</strong> er en intern
                  beregnet kostnad hvis dere priser CO₂ til{" "}
                  {SHADOW_PRICE_PER_TONN_NOK.toLocaleString("nb-NO")}{" "}
                  kr/tCO₂e.
                </span>
              </p>
            </div>
          </section>

          {/* Leverandører – Scope 3 */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Scope 3 – leverandører (sortert på høyest CO₂)
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Brukes til å identifisere hvilke leverandører som
              påvirker både klima og finansielt fotavtrykk mest.
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Leverandør</th>
                    <th className="py-2 pr-4 text-right">CO₂ (kg)</th>
                    <th className="py-2 pr-4 text-right">
                      Innkjøp (NOK)
                    </th>
                    <th className="py-2 pr-4 text-right">
                      g CO₂ / NOK
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vendorSummary.map((v) => {
                    const intensity =
                      v.totalSpendNok > 0
                        ? (v.totalCo2Kg / v.totalSpendNok) * 1000
                        : 0;

                    return (
                      <tr
                        key={v.vendor}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-1 pr-4">
                          {v.vendor}
                        </td>
                        <td className="py-1 pr-4 text-right">
                          {Math.round(v.totalCo2Kg).toLocaleString(
                            "nb-NO"
                          )}
                        </td>
                        <td className="py-1 pr-4 text-right">
                          {v.totalSpendNok.toLocaleString("nb-NO", {
                            style: "currency",
                            currency: "NOK",
                            maximumFractionDigits: 0,
                          })}
                        </td>
                        <td className="py-1 pr-4 text-right">
                          {intensity.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                  {vendorSummary.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-4 text-center text-slate-400"
                      >
                        Ingen fakturaer funnet for organisasjonen.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: number;
  format?: "currency" | "number";
  decimals?: number;
};

function StatCard({
  label,
  value,
  format = "number",
  decimals = 0,
}: StatCardProps) {
  let display: string;

  if (format === "currency") {
    display = value.toLocaleString("nb-NO", {
      style: "currency",
      currency: "NOK",
      maximumFractionDigits: 0,
    });
  } else {
    display = value.toLocaleString("nb-NO", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">
        {display}
      </p>
    </div>
  );
}
