// src/components/InvoiceTable.tsx
import { useEffect, useState } from "react";
import supabase from "../lib/supabase";

type Invoice = {
  id: string;
  filename: string | null;
  vendor: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  total: number | null;
  currency: string | null;
  total_co2_kg: number | null;
};

export default function InvoiceTable() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // ------------------------------
  // 1. Last data fra databasen
  // ------------------------------
  async function loadInvoices() {
    setLoading(true);

    const { data, error } = await supabase
      .from("invoices")
      .select(
        `
        id,
        filename,
        vendor,
        invoice_no,
        invoice_date,
        total,
        currency,
        total_co2_kg
      `
      )
      .order("created_at", { ascending: false });

    if (!error && data) {
      setInvoices(data as Invoice[]);
    }

    setLoading(false);
  }

  // ------------------------------
  // 2. Real-time oppdateringer
  // ------------------------------
  useEffect(() => {
    loadInvoices();

    const channel = supabase
      .channel("invoice-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        () => loadInvoices()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ------------------------------
  // 3. Formatteringer
  // ------------------------------
  const formatNumber = (n: number | null) =>
    n == null ? "-" : n.toLocaleString("nb-NO", { minimumFractionDigits: 2 });

  const formatDate = (d: string | null) =>
    !d ? "-" : new Date(d).toLocaleDateString("nb-NO");

  // ------------------------------
  // 4. UI
  // ------------------------------
  if (loading) return <p>Laster fakturaer…</p>;

  return (
    <div className="overflow-x-auto mt-6">
      <table className="min-w-full border text-sm">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className="border px-3 py-2">Dato</th>
            <th className="border px-3 py-2">Leverandør</th>
            <th className="border px-3 py-2">Faktura nr</th>
            <th className="border px-3 py-2">Beløp</th>
            <th className="border px-3 py-2">CO₂ (kg)</th>
            <th className="border px-3 py-2">Fil</th>
          </tr>
        </thead>

        <tbody>
          {invoices.length === 0 && (
            <tr>
              <td className="text-center py-4" colSpan={6}>
                Ingen fakturaer funnet.
              </td>
            </tr>
          )}

          {invoices.map((inv) => (
            <tr key={inv.id} className="hover:bg-slate-50">
              <td className="border px-3 py-2">{formatDate(inv.invoice_date)}</td>
              <td className="border px-3 py-2">{inv.vendor ?? "Ukjent"}</td>
              <td className="border px-3 py-2">{inv.invoice_no ?? "-"}</td>
              <td className="border px-3 py-2">
                {inv.currency ?? "NOK"} {formatNumber(inv.total)}
              </td>
              <td className="border px-3 py-2">
                {formatNumber(inv.total_co2_kg)}
              </td>
              <td className="border px-3 py-2">
                {inv.filename ? (
                  <a
                    className="text-emerald-600 hover:underline"
                    href={`https://<YOUR-SUPABASE-BUCKET-URL>/${inv.filename}`}
                    target="_blank"
                  >
                    Åpne PDF
                  </a>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
