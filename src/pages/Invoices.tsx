// src/pages/Invoices.tsx

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("document")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading documents:", error);
        setError(error.message ?? "Unknown error");
        setDocs([]);
      } else {
        setDocs((data || []) as DocumentRow[]);
      }

      setLoading(false);
    };

    load();
  }, []);

  // --- helpers ------------------------------------------------------------

  const formatAmount = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return value.toLocaleString("nb-NO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const formatCO2 = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return value.toLocaleString("nb-NO", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  };

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("nb-NO");
  };

  // --- totals for cards ---------------------------------------------------

  const totalInvoices = docs.length;
  const sumAmount = docs.reduce(
    (sum, d) => sum + (d.total_amount ?? 0),
    0
  );
  const sumCo2 = docs.reduce(
    (sum, d) => sum + (d.co2_kg ?? 0),
    0
  );
  const sumFuel = docs.reduce(
    (sum, d) => sum + (d.fuel_liters ?? 0),
    0
  );
  const currency = docs[0]?.currency ?? "NOK";

  // --- render -------------------------------------------------------------

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Invoices &amp; CO₂</h1>

      {/* errors */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      {/* summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Invoices
          </p>
          <p className="mt-3 text-2xl font-bold">{totalInvoices}</p>
        </div>

        <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Total amount
          </p>
          <p className="mt-3 text-2xl font-bold">
            {formatAmount(sumAmount)} {currency}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Total CO₂
          </p>
          <p className="mt-3 text-2xl font-bold">
            {formatCO2(sumCo2)} kg
          </p>
          <p className="mt-1 text-xs text-slate-500">
            From approx. {formatAmount(sumFuel)} liters of fuel
          </p>
        </div>
      </div>

      {/* table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Invoice ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Issue date
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Amount (NOK)
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                CO₂ (kg)
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fuel (liters)
              </th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-slate-500"
                >
                  Loading invoices…
                </td>
              </tr>
            )}

            {!loading && docs.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-slate-500"
                >
                  No invoices found.
                </td>
              </tr>
            )}

            {!loading &&
              docs.map((doc) => (
                <tr
                  key={doc.id}
                  className="border-t border-gray-200 hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/invoice/${doc.id}`)}
                >
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {doc.id}
                  </td>
                  <td className="px-4 py-2">
                    {formatDate(doc.issue_date)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatAmount(doc.total_amount)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatCO2(doc.co2_kg)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatAmount(doc.fuel_liters)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
