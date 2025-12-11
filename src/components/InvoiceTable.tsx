// src/components/InvoiceTable.tsx
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Hent fakturaer
  // ---------------------------------------------------------------------------
  useEffect(() => {
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
        setError(err.message || "Kunne ikke hente fakturaer.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // ---------------------------------------------------------------------------
  // Slett faktura
  // ---------------------------------------------------------------------------
  async function handleDelete(row: InvoiceRow) {
    const confirmed = window.confirm(
      `Vil du slette faktura "${row.invoice_no ?? row.id}"?`
    );
    if (!confirmed) return;

    try {
      setDeletingId(row.id);
      setError(null);

      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", row.id);

      if (error) throw error;

      // Fjern fra lokal state
      setRows(prev => prev.filter(r => r.id !== row.id));
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Kunne ikke slette faktura.");
    } finally {
      setDeletingId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-slate-900">Dokumenter</h2>
          <p className="mt-1 text-xs text-slate-500">
            Alle faktura-dokumenter som brukes i beregningene.
          </p>
        </div>
        {loading && (
          <p className="text-xs text-slate-400">Laster fakturaer …</p>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Dato
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Leverandør
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Faktura #
              </th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Beløp
              </th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                CO₂ (kg)
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Handling
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-4 text-center text-sm text-slate-500"
                >
                  Ingen fakturaer ennå. Last opp en faktura for å starte.
                </td>
              </tr>
            )}

            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2 text-sm text-slate-700">
                  {row.invoice_date
                    ? new Date(row.invoice_date).toLocaleDateString("nb-NO")
                    : "–"}
                </td>
                <td className="px-4 py-2 text-sm text-slate-700">
                  {row.vendor || "Ukjent"}
                </td>
                <td className="px-4 py-2 text-sm text-slate-700">
                  {row.invoice_no || "–"}
                </td>
                <td className="px-4 py-2 text-right text-sm text-slate-700">
                  {row.total != null
                    ? `${row.total.toLocaleString("nb-NO", {
                        maximumFractionDigits: 0,
                      })} ${row.currency ?? "NOK"}`
                    : "–"}
                </td>
                <td className="px-4 py-2 text-right text-sm text-slate-700">
                  {row.total_co2_kg != null
                    ? row.total_co2_kg.toFixed(1)
                    : "–"}
                </td>
                <td className="px-4 py-2 text-sm text-slate-700">
                  {row.status || "parsed"}
                </td>
                <td className="px-4 py-2 text-right text-sm text-slate-700 space-x-2">
                  {row.public_url && (
                    <a
                      href={row.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-emerald-700 hover:underline"
                    >
                      Åpne
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(row)}
                    disabled={deletingId === row.id}
                    className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    {deletingId === row.id ? "Sletter…" : "Slett"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
