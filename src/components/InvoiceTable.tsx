import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type InvoiceRow = {
  id: string;
  invoice_date: string | null;
  vendor: string | null;
  invoice_no: string | null;
  total: number | null;
  currency: string | null;
  total_co2_kg: number | null;
  public_url: string | null;
  status: string | null;
};

export default function InvoiceTable() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setLoading(true);

      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_date, vendor, invoice_no, total, currency, total_co2_kg, public_url, status"
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      setRows((data ?? []) as InvoiceRow[]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not fetch invoices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel("invoices-table")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      {loading && <div className="text-xs text-slate-500">Loading...</div>}
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border border-slate-200">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left border-b font-medium">Date</th>
              <th className="px-3 py-2 text-left border-b font-medium">Vendor</th>
              <th className="px-3 py-2 text-left border-b font-medium">Invoice #</th>
              <th className="px-3 py-2 text-right border-b font-medium">Amount</th>
              <th className="px-3 py-2 text-right border-b font-medium">CO₂ (kg)</th>
              <th className="px-3 py-2 text-center border-b font-medium">Status</th>
              <th className="px-3 py-2 text-center border-b font-medium">File</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-3 py-2">{formatDate(r.invoice_date)}</td>
                <td className="px-3 py-2 font-medium">
                  {r.vendor ?? "Unknown vendor"}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {r.invoice_no ?? "-"}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.total != null
                    ? `${formatNumber(r.total)} ${r.currency ?? "NOK"}`
                    : "-"}
                </td>
                <td className="px-3 py-2 text-right font-medium text-emerald-700">
                  {formatCo2(r.total_co2_kg)}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === "parsed"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {r.status || "pending"}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  {r.public_url ? (
                    <a
                      href={r.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline text-sm"
                    >
                      View
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
                  colSpan={7}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No invoices yet. Upload an invoice to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
