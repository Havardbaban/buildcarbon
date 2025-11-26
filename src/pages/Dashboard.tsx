// src/pages/Dashboard.tsx

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

type DocumentRow = {
  id: string;
  supplier_name: string | null;
  issue_date: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
};

type MonthlyRow = {
  monthKey: string; // "2025-01"
  totalCo2: number;
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return value.toLocaleString("nb-NO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return value.toLocaleString("nb-NO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "–";
  try {
    const d = new Date(value);
    return d.toLocaleDateString("nb-NO");
  } catch {
    return value;
  }
}

export default function DashboardPage() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [totalEmissions, setTotalEmissions] = useState(0);
  const [totalSpend, setTotalSpend] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("document")
      .select(
        "id, supplier_name, issue_date, total_amount, currency, co2_kg"
      )
      .order("issue_date", { ascending: true });

    if (error) {
      console.error("Error loading dashboard data:", error);
      setError(error.message);
      setDocs([]);
      setTotalEmissions(0);
      setTotalSpend(0);
      setMonthly([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as DocumentRow[];
    setDocs(rows);

    // Totals
    const sumCo2 = rows.reduce(
      (acc, r) => acc + (r.co2_kg ?? 0),
      0
    );
    const sumSpend = rows.reduce(
      (acc, r) => acc + (r.total_amount ?? 0),
      0
    );

    setTotalEmissions(sumCo2);
    setTotalSpend(sumSpend);

    // Monthly aggregation
    const monthMap = new Map<string, number>();

    for (const r of rows) {
      if (!r.issue_date) continue;
      const d = new Date(r.issue_date);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      const prev = monthMap.get(key) ?? 0;
      monthMap.set(key, prev + (r.co2_kg ?? 0));
    }

    const monthRows: MonthlyRow[] = Array.from(monthMap.entries())
      .map(([monthKey, totalCo2]) => ({ monthKey, totalCo2 }))
      .sort((a, b) => (a.monthKey < b.monthKey ? -1 : 1));

    setMonthly(monthRows);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Enkle MVP-antakelser
  const REDUCTION_PCT = 0.1;
  const potentialAnnualSavings = totalSpend * REDUCTION_PCT;
  const potentialAnnualCo2Reduction = totalEmissions * REDUCTION_PCT;

  return (
    <div className="max-w-6xl mx-auto py-10 space-y-8">
      <h1 className="text-2xl font-semibold mb-2">ESG & Carbon Dashboard</h1>
      <p className="text-sm text-slate-600 mb-4">
        Overview of emissions, spend, and potential savings based on uploaded
        invoices.
      </p>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-slate-500 mb-4">Loading dashboard…</div>
      )}

      {/* Top summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500 mb-1">
            TOTAL EMISSIONS
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {formatNumber(totalEmissions)} kg
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Based on all invoices in the system
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500 mb-1">
            TOTAL SPEND (ENERGY & FUEL)
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {formatMoney(totalSpend)} NOK
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Sum of invoice totals
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500 mb-1">
            POTENTIAL ANNUAL SAVINGS
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {formatMoney(potentialAnnualSavings)} NOK
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Assuming ~10 % reduction in relevant spend
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500 mb-1">
            POTENTIAL CO₂ REDUCTION / YR
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {formatNumber(potentialAnnualCo2Reduction)} kg
          </div>
          <div className="text-xs text-slate-500 mt-1">
            If all proposed measures are implemented
          </div>
        </div>
      </div>

      {/* Monthly trend & breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">
            Monthly CO₂ trend
          </h2>
          {monthly.length === 0 ? (
            <div className="text-sm text-slate-500">
              Not enough dated invoices to show a trend yet.
            </div>
          ) : (
            <ul className="text-sm text-slate-700 space-y-1">
              {monthly.map((m) => (
                <li
                  key={m.monthKey}
                  className="flex justify-between border-b border-slate-100 last:border-b-0 py-1"
                >
                  <span>{m.monthKey}</span>
                  <span>{formatNumber(m.totalCo2)} kg</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">
            Emissions breakdown
          </h2>
          {totalEmissions <= 0 ? (
            <div className="text-sm text-slate-500">
              Upload more invoices to get detailed emissions tracking and
              optimization recommendations.
            </div>
          ) : (
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex justify-between">
                <span>High emissions (&gt; 100 kg CO₂)</span>
                <span>
                  {formatNumber(
                    docs
                      .filter((d) => (d.co2_kg ?? 0) > 100)
                      .reduce((acc, d) => acc + (d.co2_kg ?? 0), 0)
                  )}{" "}
                  kg
                </span>
              </div>
              <div className="flex justify-between">
                <span>Lower emissions (&le; 100 kg CO₂)</span>
                <span>
                  {formatNumber(
                    docs
                      .filter((d) => (d.co2_kg ?? 0) <= 100)
                      .reduce((acc, d) => acc + (d.co2_kg ?? 0), 0)
                  )}{" "}
                  kg
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 mt-1">
                <span>Total</span>
                <span>{formatNumber(totalEmissions)} kg</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invoice-level table */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Invoice-level ESG view</h2>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  Supplier
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  Invoice date
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">
                  Amount (NOK)
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">
                  CO₂ (kg)
                </th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    No invoices found. Upload one on the Invoices page to get
                    started.
                  </td>
                </tr>
              )}

              {docs.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-800">
                    {row.supplier_name || "Unknown"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDate(row.issue_date)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {row.total_amount !== null
                      ? `${formatMoney(row.total_amount)} ${
                          row.currency || "NOK"
                        }`
                      : "–"}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {row.co2_kg !== null ? formatNumber(row.co2_kg) : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
