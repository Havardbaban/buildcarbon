// src/pages/Measures.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type DocumentRow = {
  id: string;
  supplier_name: string | null;
  issue_date: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
};

type MeasureRow = {
  id: string;
  title: string;
  category: string;
  annualSavingsNok: number;
  annualCo2ReductionKg: number;
  paybackYears: number;
  sourceInvoiceId: string;
  supplier: string | null;
};

function formatNumber(value: number | null | undefined) {
  if (value == null || isNaN(value)) return "-";
  return value.toLocaleString("nb-NO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatMoney(value: number | null | undefined, currency = "NOK") {
  if (value == null || isNaN(value)) return "-";
  return (
    value.toLocaleString("nb-NO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " " + currency
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "–";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("nb-NO");
}

export default function MeasuresPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [measures, setMeasures] = useState<MeasureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("document")
        .select(
          "id, supplier_name, issue_date, total_amount, currency, co2_kg"
        )
        .order("issue_date", { ascending: false });

      if (error) {
        console.error("Failed to load documents:", error);
        setError(error.message);
        setLoading(false);
        return;
      }

      const docs = (data || []) as DocumentRow[];
      setDocuments(docs);

      const generated: MeasureRow[] = [];

      for (const doc of docs) {
        const spend = doc.total_amount ?? 0;
        const co2 = doc.co2_kg ?? 0;

        if (spend <= 0 && co2 <= 0) continue;

        const supplier = (doc.supplier_name || "Unknown").toLowerCase();
        let category = "Operations";
        let title = "Operational optimization pack";

        if (supplier.includes("property") || supplier.includes("bygg")) {
          category = "Buildings";
          title = "Energy efficiency upgrade (buildings)";
        }
        if (
          supplier.includes("transport") ||
          supplier.includes("fuel") ||
          supplier.includes("drivstoff")
        ) {
          category = "Fleet / Transport";
          title = "Fuel efficiency program";
        }

        const annualSavings = spend * 0.03; // 3%
        const annualCo2Reduction = co2 * 0.15; // 15%

        if (annualSavings <= 0 && annualCo2Reduction <= 0) continue;

        const capex = spend * 0.1; // invest ~10% av spend
        const paybackYears =
          annualSavings > 0 && capex > 0 ? capex / annualSavings : 0;

        generated.push({
          id: `${doc.id}-measure`,
          title,
          category,
          annualSavingsNok: annualSavings,
          annualCo2ReductionKg: annualCo2Reduction,
          paybackYears,
          sourceInvoiceId: doc.id,
          supplier: doc.supplier_name,
        });
      }

      setMeasures(generated);
      setLoading(false);
    }

    load();
  }, []);

  const totalCo2 = documents.reduce(
    (sum, d) => sum + (d.co2_kg || 0),
    0
  );
  const totalSpend = documents.reduce(
    (sum, d) => sum + (d.total_amount || 0),
    0
  );
  const totalAnnualSavings = measures.reduce(
    (sum, m) => sum + m.annualSavingsNok,
    0
  );
  const totalAnnualCo2Reduction = measures.reduce(
    (sum, m) => sum + m.annualCo2ReductionKg,
    0
  );

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">
        Measures &amp; Savings (auto-generated)
      </h1>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 mb-1">MEASURES</div>
          <div className="text-2xl font-semibold">
            {measures.length.toLocaleString("nb-NO")}
          </div>
          <div className="text-xs text-slate-500">
            Automatically generated from invoices
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 mb-1">
            ANNUAL SAVINGS (NOK)
          </div>
          <div className="text-2xl font-semibold">
            {formatMoney(totalAnnualSavings)}
          </div>
          <div className="text-xs text-slate-500">
            Approx. 3% of relevant spend
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 mb-1">
            ANNUAL CO₂ REDUCTION
          </div>
          <div className="text-2xl font-semibold">
            {formatNumber(totalAnnualCo2Reduction)} kg
          </div>
          <div className="text-xs text-slate-500">
            Approx. 15% of baseline emissions
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 mb-1">TOTAL SPEND (NOK)</div>
          <div className="text-2xl font-semibold">
            {formatMoney(totalSpend)}
          </div>
          <div className="text-xs text-slate-500">
            Based on all uploaded invoices
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            Suggested measures
          </h2>
          <span className="text-xs text-slate-500">
            Linked to your invoices
          </span>
        </div>

        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-500">
            Loading measures…
          </div>
        ) : measures.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">
            No measures yet. Upload invoices with CO₂ or energy/fuel
            information to generate suggestions.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Measure</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Supplier</th>
                <th className="px-4 py-2 font-medium">Annual savings</th>
                <th className="px-4 py-2 font-medium">Annual CO₂</th>
                <th className="px-4 py-2 font-medium">Payback (yrs)</th>
              </tr>
            </thead>
            <tbody>
              {measures.map((m) => (
                <tr
                  key={m.id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-2">{m.title}</td>
                  <td className="px-4 py-2">{m.category}</td>
                  <td className="px-4 py-2">
                    {m.supplier || "Unknown"}
                  </td>
                  <td className="px-4 py-2">
                    {formatMoney(m.annualSavingsNok)}
                  </td>
                  <td className="px-4 py-2">
                    {formatNumber(m.annualCo2ReductionKg)} kg
                  </td>
                  <td className="px-4 py-2">
                    {m.paybackYears > 0
                      ? m.paybackYears.toFixed(1)
                      : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
