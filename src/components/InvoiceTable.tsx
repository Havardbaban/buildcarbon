// src/components/InvoiceTable.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type DocumentRow = {
  id: string;
  issue_date: string | null;
  supplier_name: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
  file_path?: string | null;
};

export default function InvoiceTable() {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setLoading(true);

      const { data, error } = await supabase
        .from("document")
        .select(
          "id, issue_date, supplier_name, total_amount, currency, co2_kg, file_path"
        )
        .order("issue_date", { ascending: false })
        .limit(200);

      if (error) throw error;

      setRows((data ?? []) as DocumentRow[]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Kunne ikke hente dokumenter.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const handler = () => load();
    window.addEventListener("invoice:updated", handler);

    return () => window.removeEventListener("invoice:updated", handler);
  }, []);

  function formatNumber(n: number | null) {
    if (n == null) return "-";
    return n.toLocaleString("nb-NO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatCo2(n: number | null) {
    if (n == null) return "-";
    return n.toLocaleString("nb-NO", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function formatDate(d: string | null) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("nb-NO");
  }

  return (
    <div className="space-y-2">
      {loading && <div className="text-xs text-slate-500">Laster...</div>}
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border border-slate-200">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left border-b">Dato</th>
              <th className="px-2 py-1 text-left border-b">Leverandør</th>
              <th className="px-2 py-1 text-right border-b">Beløp</th>
              <th className="px-2 py-1 text-right border-b">CO₂ (kg)</th>
              <th className="px-2 py-1 text-center border-b">Fil</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-2 py-1">{formatDate(r.issue_date)}</td>
                <td className="px-2 py-1">
                  {r.supplier_name ?? "Ukjent leverandør"}
                </td>
                <td className="px-2 py-1 text-right">
                  {r.total_amount != null
                    ? `${formatNumber(r.total_amount)} ${r.currency ?? "NOK"}`
                    : "-"}
                </td>
                <td className="px-2 py-1 text-right">
                  {formatCo2(r.co2_kg)}
                </td>
                <td className="px-2 py-1 text-center">
                  {r.file_path ? (
                    <a
                      href={r.file_path}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-600 hover:underline"
                    >
                      Åpne
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-2 py-4 text-center text-slate-400"
                >
                  Ingen dokumenter ennå. Last opp en faktura.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
