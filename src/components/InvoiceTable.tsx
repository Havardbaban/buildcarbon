import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { InvoiceRow } from "../types/invoice";

export default function InvoiceTable({ refreshKey }: { refreshKey?: string }) {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) setRows(data as InvoiceRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  if (loading) return <p>Loading invoices…</p>;
  if (!rows.length) return <p>No invoices yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Vendor</th>
            <th className="py-2 pr-4">Total (NOK)</th>
            <th className="py-2 pr-4">CO₂ (kg)</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">File</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2 pr-4">{r.invoice_date ?? "–"}</td>
              <td className="py-2 pr-4">{r.vendor ?? "–"}</td>
              <td className="py-2 pr-4">{r.total_amount ?? "–"}</td>
              <td className="py-2 pr-4">{r.co2_kg ?? "–"}</td>
              <td className="py-2 pr-4">{r.status}</td>
              <td className="py-2 pr-4">
                {r.public_url ? (
                  <a className="underline" href={r.public_url} target="_blank" rel="noreferrer">
                    view
                  </a>
                ) : (
                  "–"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
