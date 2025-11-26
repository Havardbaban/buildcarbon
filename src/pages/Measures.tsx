// src/pages/Measures.tsx

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

type DocumentRow = {
  id: string;
  supplier_name: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
  fuel_liters: number | null;
  energy_kwh: number | null;
  gas_m3: number | null;
};

type MeasureRow = {
  id: string;
  measureName: string;
  category: string;
  supplier: string;
  annualSavingsNok: number;
  annualCo2ReductionKg: number;
  capexNok: number;
  paybackYears: number | null;
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

export default function MeasuresPage() {
  const [measures, setMeasures] = useState<MeasureRow[]>([]);
  const [totalSavings, setTotalSavings] = useState(0);
  const [totalCo2Reduction, setTotalCo2Reduction] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMeasures = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("document")
      .select(
        "id, supplier_name, total_amount, currency, co2_kg, fuel_liters, energy_kwh, gas_m3"
      );

    if (error) {
      console.error("Error loading documents for measures:", error);
      setError(error.message);
      setMeasures([]);
      setTotalSavings(0);
      setTotalCo2Reduction(0);
      setLoading(false);
      return;
    }

    const docs = (data ?? []) as DocumentRow[];
    const generated: MeasureRow[] = [];

    const REDUCTION_PCT = 0.1; // 10 % reduksjon i MVP

    for (const doc of docs) {
      const spend = doc.total_amount ?? 0;
      const co2 = doc.co2_kg ?? 0;

      if (!spend && !co2) {
        // Har hverken kostnad eller CO2 → hopper over i MVP
        continue;
      }

      let measureName = "Operational optimization pack";
      let category = "Operations";

      if (doc.fuel_liters && doc.fuel_liters > 0) {
        measureName = "Fuel efficiency program";
        category = "Fleet / Transport";
      } else if (doc.energy_kwh && doc.energy_kwh > 0) {
        measureName = "Energy efficiency upgrade";
        category = "Buildings / Energy";
      }

      const annualSavingsNok = spend * REDUCTION_PCT;
      const annualCo2ReductionKg = co2 * REDUCTION_PCT;

      // Veldig enkel CAPEX- og payback-modell for MVP
      const capexNok = spend * 0.5; // anta at tiltak koster ca. 50 % av årlig spend
      const paybackYears =
        annualSavingsNok > 0 ? capexNok / annualSavingsNok : null;

      generated.push({
        id: doc.id,
        measureName,
        category,
        supplier: doc.supplier_name || "Unknown",
        annualSavingsNok,
        annualCo2ReductionKg,
        capexNok,
        paybackYears,
      });
    }

    setMeasures(generated);

    const sumSavings = generated.reduce(
      (acc, m) => acc + (m.annualSavingsNok || 0),
      0
    );
    const sumCo2 = generated.reduce(
      (acc, m) => acc + (m.annualCo2ReductionKg || 0),
      0
    );

    setTotalSavings(sumSavings);
    setTotalCo2Reduction(sumCo2);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMeasures();
  }, [loadMeasures]);

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-8">
      <h1 className="text-2xl font-semibold mb-2">Measures & Savings</h1>
      <p className="text-sm text-slate-600 mb-4">
        Based on uploaded invoices, we estimate simple rule-based measures with
        potential annual savings in NOK and CO₂.
      </p>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-slate-500 mb-4">Loading measures…</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500 mb-1">
            MEASURES
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {measures.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Automatically generated from invoices
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500 mb-1">
            ANNUAL SAVINGS (NOK)
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {formatMoney(totalSavings)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Assuming ~10 % reduction in relevant costs
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500 mb-1">
            ANNUAL CO₂ REDUCTION (kg)
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {formatNumber(totalCo2Reduction)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Approximate, based on invoice-derived emissions
          </div>
        </div>
      </div>

      {/* Detailed table */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Suggested measures</h2>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  Measure
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  Category
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  Supplier / Invoice
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">
                  Annual savings (NOK)
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">
                  Annual CO₂ reduction (kg)
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">
                  CAPEX (NOK, est.)
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">
                  Payback (yrs)
                </th>
              </tr>
            </thead>
            <tbody>
              {measures.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    No measures suggested yet. Upload invoices with energy or
                    fuel usage to generate ideas.
                  </td>
                </tr>
              )}

              {measures.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-800">{m.measureName}</td>
                  <td className="px-4 py-3 text-slate-700">{m.category}</td>
                  <td className="px-4 py-3 text-slate-700">{m.supplier}</td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {formatMoney(m.annualSavingsNok)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {formatNumber(m.annualCo2ReductionKg)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {formatMoney(m.capexNok)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {m.paybackYears != null
                      ? m.paybackYears.toFixed(1)
                      : "–"}
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
