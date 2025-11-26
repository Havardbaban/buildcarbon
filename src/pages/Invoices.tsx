// src/pages/Invoices.tsx
import React, { useEffect, useState } from "react";
import supabase from "../lib/supabase";

type DocumentRow = {
  id: string;
  issue_date: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
};

function formatNumber(value: number | null) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("nb-NO");
}

export default function Invoices() {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocs = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("document")
        .select<"*", DocumentRow>("id, issue_date, total_amount, currency, co2_kg")
        .order("issue_date", { ascending: false });

      if (error) {
        console.error("Error loading documents", error);
        setError(error.message);
      } else {
        setRows(data || []);
      }

      setLoading(false);
    };

    fetchDocs();
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-6">Invoices</h1>

      {loading && <p>Loading invoices…</p>}
      {error && <p className="text-red-600">Error: {error}</p>}

      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">Invoice ID</th>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-right">CO₂ (kg)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  No invoices found. Upload one on the Invoice Scanner page.
                </td>
              </tr>
            )}

            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-2">{row.id}</td>
                <td className="px-4 py-2">{formatDate(row.issue_date)}</td>
                <td className="px-4 py-2 text-right">
                  {row.total_amount !== null
                    ? `${formatNumber(row.total_amount)} ${row.currency || "NOK"}`
                    : "-"}
                </td>
                <td className="px-4 py-2 text-right">
                  {row.co_kg !== null ? formatNumber(row.co_kg) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
