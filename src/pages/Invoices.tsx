// src/pages/Invoices.tsx

import { useEffect, useState } from "react";
import supabase from "../lib/supabase";

type DocumentRow = {
  id: string;
  org_id: string;
  issue_date: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
  fuel_liters: number | null;
};

export default function InvoicesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("document")
        .select<"*", DocumentRow>("id, org_id, issue_date, total_amount, currency, co2_kg, fuel_liters");

      if (error) {
        console.error("Error loading documents:", error);
        setError(error.message ?? "Unknown error");
      } else {
        setDocs(data || []);
      }

      setLoading(false);
    };

    load();
  }, []);

  // Simple totals
  const totalInvoices = docs.length;
  const sumAmount = docs.reduce((sum, d) => sum + (d.total_amount ?? 0), 0);
  const sumCo2 = docs.reduce((sum, d) => sum + (d.co2_kg ?? 0), 0);
  const sumFuel = docs.reduce((sum, d) => sum + (d.fuel_liters ?? 0), 0);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Invoices &amp; CO₂</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
          <div className="text-sm text-gray-500">Invoices</div>
          <div className="text-2xl font-semibold">{totalInvoices}</div>
        </div>
        <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
          <div className="text-sm text-gray-500">Total amount</div>
          <div className="text-2xl font-semibold">
            {sumAmount.toLocaleString("nb-NO", {
              maximumFractionDigits: 0,
            })}{" "}
            NOK
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
          <div className="text-sm text-gray-500">Total CO₂</div>
          <div className="text-2xl font-semibold">
            {sumCo2.toFixed(1)} kg
          </div>
          {sumFuel > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              From approx. {sumFuel.toFixed(0)} liters of fuel
            </div>
          )}
        </div>
      </div>

      {/* Status messages */}
      {loading && (
        <div className="text-gray-500">Loading invoices…</div>
      )}
      {error && (
        <div className="text-red-600 mb-4">
          Error loading invoices: {error}
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">
                  Invoice ID
                </th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600">
                  Issue date
                </th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">
                  Amount (NOK)
                </th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">
                  CO₂ (kg)
                </th>
                <th className="px-4 py-2 text-right font-semibold text-gray-600">
                  Fuel (liters)
                </th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-gray-500"
                  >
                    No invoices saved yet. Use the test upload page to add one.
                  </td>
                </tr>
              )}
              {docs.map((d) => (
                <tr key={d.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs text-gray-700">
                    {d.id}
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {d.issue_date ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-800">
                    {d.total_amount != null
                      ? d.total_amount.toLocaleString("nb-NO", {
                          maximumFractionDigits: 0,
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {d.co2_kg != null ? d.co2_kg.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {d.fuel_liters != null ? d.fuel_liters.toFixed(0) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
