// src/pages/Invoices.tsx

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import InvoiceUpload from "../components/InvoiceUpload";

type DocumentRow = {
  id: string;
  supplier_name: string | null;
  issue_date: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "–";
  return value.toLocaleString("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "–";
  // value er ISO: yyyy-mm-dd
  try {
    const d = new Date(value);
    return d.toLocaleDateString("nb-NO");
  } catch {
    return value;
  }
}

export default function InvoicesPage() {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("document")
      .select(
        "id, supplier_name, issue_date, total_amount, currency, co2_kg"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading documents:", error);
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as DocumentRow[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-8">
      {/* Øverst: upload-boksen */}
      <InvoiceUpload onUploadComplete={loadDocuments} />

      {/* Under: tabell med dokumenter */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Invoices</h2>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="mb-4 text-sm text-slate-500">Loading invoices…</div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  Invoice ID
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  Supplier
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">
                  Date
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">
                  Amount
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">
                  CO₂ (kg)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    No invoices found. Upload one above to get started.
                  </td>
                </tr>
              )}

              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-800 font-mono text-xs">
                    {row.id}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.supplier_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDate(row.issue_date)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-800">
                    {row.total_amount !== null
                      ? `${formatNumber(row.total_amount)} ${
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
