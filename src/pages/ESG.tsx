// src/pages/ESG.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import { calculateESGScore } from "../lib/emissions";

type InvoiceRow = {
  id: string;
  invoice_date: string | null;
  amount_nok: number | null;
  total_co2_kg: number | null;
  scope: string | null;
};

export default function EsgPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_date, amount_nok, total_co2_kg, scope")
        .eq("org_id", ACTIVE_ORG_ID);

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as InvoiceRow[]);
      setLoading(false);
    }

    load();
  }, []);

  const stats = useMemo(() => {
    const totalCo2 = rows.reduce((sum, r) => sum + (r.total_co2_kg ?? 0), 0);
    const totalSpend = rows.reduce((sum, r) => sum + (r.amount_nok ?? 0), 0);
    const count = rows.length;

    const scopeMap = new Map<string, number>();
    for (const row of rows) {
      const scope = row.scope ?? "Unknown";
      scopeMap.set(scope, (scopeMap.get(scope) ?? 0) + (row.total_co2_kg ?? 0));
    }

    const scopeArray = Array.from(scopeMap.entries()).map(([scope, co2]) => ({
      scope,
      co2: Math.round(co2 * 10) / 10,
    }));

    const esgScore = calculateESGScore(totalCo2, totalSpend);

    const scopeWithMax =
      scopeArray.length > 0
        ? scopeArray.reduce((a, b) => (b.co2 > a.co2 ? b : a))
        : null;

    return {
      totalCo2,
      totalSpend,
      count,
      esgScore,
      scopeArray,
      worstScope: scopeWithMax?.scope ?? null,
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ESG &amp; utslipp</h1>
        <p className="text-sm text-gray-500">
          Vi beregner CO₂ fra fakturaene dine og gir en enkel ESG-score
          (miljø).
        </p>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {!loading && stats.count === 0 && (
        <p className="text-sm text-gray-500">
          Ingen fakturaer enda. Last opp fakturaer for å få ESG-oversikt.
        </p>
      )}

      {!loading && stats.count > 0 && (
        <>
          {/* Top cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">
                ESG-SCORE (MILJØ)
              </p>
              <p className="mt-3 text-4xl font-bold">
                {stats.esgScore}
                <span className="ml-1 text-base text-gray-500">/100</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Basert på kg CO₂ per krone brukt.
              </p>
            </div>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">
                TOTAL CO₂
              </p>
              <p className="mt-3 text-3xl font-bold">
                {stats.totalCo2.toLocaleString("nb-NO", {
                  maximumFractionDigits: 1,
                })}{" "}
                <span className="text-base font-normal text-gray-500">
                  kg
                </span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Basert på {stats.count} fakturaer.
              </p>
            </div>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500">
                SCOPE MED HØYEST UTSLIPP
              </p>
              <p className="mt-3 text-2xl font-bold">
                {stats.worstScope ?? "Ingen"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Fokuser tiltak her for størst effekt.
              </p>
            </div>
          </div>

          {/* Scope table */}
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold">Utslipp per scope</p>
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="border-b text-gray-500">
                <tr>
                  <th className="py-1 pr-2">Scope</th>
                  <th className="py-1 pr-2 text-right">CO₂ (kg)</th>
                </tr>
              </thead>
              <tbody>
                {stats.scopeArray.map((row) => (
                  <tr key={row.scope} className="border-b last:border-0">
                    <td className="py-1 pr-2">{row.scope}</td>
                    <td className="py-1 pr-2 text-right">
                      {row.co2.toLocaleString("nb-NO")} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
