// src/pages/Dashboard.tsx

import { useEffect, useState } from "react";
import supabase from "../lib/supabase";

type InvoiceRow = {
  id: string;
  vendor: string | null;
  invoice_date: string | null;
  total: number | null;
  currency: string | null;
  total_co2_kg: number | null;
};

type MeasureSummary = {
  totalAnnualNokSave: number;
  totalAnnualCo2Save: number;
  totalNPV: number;
};

const DISCOUNT_RATE = 0.08; // 8% discount rate, same as Measures page

function calcNPV(
  annualCashflow: number,
  years: number,
  discountRate: number
): number {
  if (annualCashflow === 0 || years <= 0) return 0;
  let npv = 0;
  for (let t = 1; t <= years; t++) {
    npv += annualCashflow / Math.pow(1 + discountRate, t);
  }
  return npv;
}

function formatMoney(value: number): string {
  if (!isFinite(value)) return "—";
  return value.toLocaleString("nb-NO", {
    maximumFractionDigits: 0,
  });
}

function formatCo2(value: number): string {
  if (!isFinite(value)) return "—";
  return value.toLocaleString("nb-NO", {
    maximumFractionDigits: 1,
  });
}

/**
 * Simple measure summary using same logic as Measures.tsx:
 * - Fuel invoices: 10% potential saving
 * - High CO₂ invoices: additional 5% operational saving
 */
function summarizeMeasures(docs: InvoiceRow[]): MeasureSummary {
  let totalAnnualNokSave = 0;
  let totalAnnualCo2Save = 0;
  let totalNPV = 0;

  docs.forEach((doc) => {
    const baseNok = doc.total ?? 0;
    const baseCo2 = doc.total_co2_kg ?? 0;

    const annualNok = baseNok * 12;
    const annualCo2 = baseCo2 * 12;

    if (baseCo2 > 100) {
      const savingPct = 0.1;
      const capex = 40_000;
      const lifetimeYears = 5;

      const annualNokSave = annualNok * savingPct;
      const annualCo2Save = annualCo2 * savingPct;

      const npvGross = calcNPV(annualNokSave, lifetimeYears, DISCOUNT_RATE);
      const npv = npvGross - capex;

      totalAnnualNokSave += annualNokSave;
      totalAnnualCo2Save += annualCo2Save;
      totalNPV += npv;
    }
  });

  return { totalAnnualNokSave, totalAnnualCo2Save, totalNPV };
}

type MonthlyPoint = {
  key: string; // YYYY-MM
  label: string; // e.g. "Jan 25"
  totalCo2: number;
};

export default function DashboardPage() {
  const [docs, setDocs] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.from("invoices").select("*");

      if (error) {
        console.error("Error loading invoices:", error);
        setError(error.message ?? "Unknown error");
        setDocs([]);
      } else {
        setDocs((data || []) as InvoiceRow[]);
      }

      setLoading(false);
    };

    load();
  }, []);

  const totalInvoices = docs.length;
  const totalAmount = docs.reduce(
    (sum, d) => sum + (d.total ?? 0),
    0
  );
  const totalCo2 = docs.reduce((sum, d) => sum + (d.total_co2_kg ?? 0), 0);
  const currency = docs[0]?.currency ?? "NOK";

  const highCo2 = docs
    .filter((d) => (d.total_co2_kg ?? 0) > 100)
    .reduce((sum, d) => sum + (d.total_co2_kg ?? 0), 0);
  const lowCo2 = totalCo2 - highCo2;

  // Measures summary (potential savings)
  const {
    totalAnnualNokSave,
    totalAnnualCo2Save,
    totalNPV,
  } = summarizeMeasures(docs);

  const monthlyMap = new Map<string, MonthlyPoint>();

  docs.forEach((doc) => {
    if (!doc.invoice_date || doc.total_co2_kg == null) return;
    const date = new Date(doc.invoice_date);
    if (isNaN(date.getTime())) return;

    const year = date.getFullYear();
    const month = date.getMonth();

    const key = `${year}-${String(month + 1).padStart(2, "0")}`;

    const label = date.toLocaleDateString("en-GB", {
      month: "short",
      year: "2-digit",
    });

    const existing = monthlyMap.get(key);
    if (existing) {
      existing.totalCo2 += doc.total_co2_kg ?? 0;
    } else {
      monthlyMap.set(key, {
        key,
        label,
        totalCo2: doc.total_co2_kg ?? 0,
      });
    }
  });

  const monthlySeries = Array.from(monthlyMap.values()).sort((a, b) =>
    a.key.localeCompare(b.key)
  );

  const maxMonthlyCo2 =
    monthlySeries.reduce(
      (max, m) => (m.totalCo2 > max ? m.totalCo2 : max),
      0
    ) || 1;

  const highShare = totalCo2 > 0 ? (highCo2 / totalCo2) * 100 : 0;
  const lowShare = 100 - highShare;

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">ESG &amp; Carbon Dashboard</h1>
      <p className="text-sm text-slate-500 mb-8">
        Overview of emissions, spend, and savings potential based on uploaded
        invoices.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      {/* Top summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Total emissions
          </p>
          <p className="mt-3 text-2xl font-bold">
            {formatCo2(totalCo2)} kg
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Based on all invoices in the system.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Total spend (energy &amp; fuel)
          </p>
          <p className="mt-3 text-2xl font-bold">
            {formatMoney(totalAmount)} {currency}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Sum of invoice totals.
          </p>
        </div>

        <div className="rounded-xl border border-green-200 p-4 bg-green-50 shadow-sm">
          <p className="text-xs font-semibold uppercase text-green-700">
            Potential annual savings
          </p>
          <p className="mt-3 text-2xl font-bold text-green-800">
            {formatMoney(totalAnnualNokSave)} {currency}
          </p>
          <p className="mt-1 text-xs text-green-700">
            From rule-based measures (fuel &amp; operational).
          </p>
        </div>

        <div className="rounded-xl border border-green-200 p-4 bg-green-50 shadow-sm">
          <p className="text-xs font-semibold uppercase text-green-700">
            Potential CO₂ reduction / yr
          </p>
          <p className="mt-3 text-2xl font-bold text-green-800">
            {formatCo2(totalAnnualCo2Save)} kg
          </p>
          <p className="mt-1 text-xs text-green-700">
            If all proposed measures are implemented.
          </p>
        </div>
      </div>

      {/* NPV & overview */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 mb-8">
        <p className="font-semibold">
          Portfolio NPV of proposed measures:{" "}
          {formatMoney(totalNPV)} {currency}
        </p>
        <p className="text-xs mt-1">
          Calculated with 8% discount rate, simple capex assumptions, and a
          combination of fuel efficiency and operational optimization
          measures derived from invoices.
        </p>
      </div>

      {/* Middle section: trend + breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        {/* Monthly trend "chart" */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2">
          <p className="text-xs font-semibold uppercase text-slate-500 mb-3">
            Monthly CO₂ trend
          </p>

          {monthlySeries.length === 0 ? (
            <p className="text-sm text-slate-500">
              Not enough dated invoices to show a trend yet.
            </p>
          ) : (
            <div className="flex items-end gap-3 h-40">
              {monthlySeries.map((m) => {
                const height = Math.max(
                  8,
                  (m.totalCo2 / maxMonthlyCo2) * 120
                );
                return (
                  <div key={m.key} className="flex flex-col items-center gap-1">
                    <div
                      className="w-6 rounded-md bg-sky-500"
                      style={{ height }}
                    />
                    <span className="text-[11px] text-slate-500">
                      {m.label}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatCo2(m.totalCo2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500 mb-3">
            Emissions breakdown
          </p>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600">
                  High emissions (&gt;100 kg CO₂)
                </span>
                <span className="font-medium text-slate-800">
                  {formatCo2(highCo2)} kg
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-red-500"
                  style={{ width: `${highShare || 0}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Invoices with significant carbon footprint
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600">
                  Lower emissions (&lt;100 kg CO₂)
                </span>
                <span className="font-medium text-slate-800">
                  {formatCo2(lowCo2)} kg
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500"
                  style={{ width: `${lowShare || 0}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Invoices with lower carbon footprint
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 mt-2">
              <p className="text-[11px] text-slate-500">
                Upload more invoices to get detailed emissions tracking and optimization recommendations.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice / ESG summary table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Invoice-level ESG view
          </p>
          <p className="text-xs text-slate-400">
            {totalInvoices} invoices in dataset
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Vendor
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Invoice date
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Amount ({currency})
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  CO₂ (kg)
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    Loading ESG data…
                  </td>
                </tr>
              )}

              {!loading && docs.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    No invoices yet. Upload invoices to see ESG metrics.
                  </td>
                </tr>
              )}

              {!loading &&
                docs.map((d) => {
                  const dateLabel = d.invoice_date
                    ? new Date(d.invoice_date).toLocaleDateString("nb-NO")
                    : "—";
                  return (
                    <tr
                      key={d.id}
                      className="border-t border-slate-100 align-top"
                    >
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {d.vendor ?? "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-sm">{dateLabel}</td>
                      <td className="px-4 py-3 text-right text-sm">
                        {formatMoney(d.total ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {formatCo2(d.total_co2_kg ?? 0)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
