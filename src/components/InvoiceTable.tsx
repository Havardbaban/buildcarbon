// src/components/InvoiceTable.tsx

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";

type InvoiceRow = {
  id: string;
  invoice_date: string;
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
  const [deletingAll, setDeletingAll] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_date, vendor, invoice_no, total, currency, total_co2_kg, public_url, status"
        )
        .eq("org_id", ACTIVE_ORG_ID)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        console.error("[InvoiceTable] load error", error);
        setError("Kunne ikke hente fakturaer: " + error.message);
        setRows([]);
        return;
      }

      setRows((data ?? []) as InvoiceRow[]);
    } catch (err: any) {
      console.error("[InvoiceTable] load unknown error", err);
      setError("Ukjent feil ved henting av fakturaer.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm("Er du sikker på at du vil slette denne fakturaen?")) {
      return;
    }

    setDeletingId(id);
    setError(null);

    try {
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", id); // én faktura – id er alltid unik

      if (error) {
        console.error("[InvoiceTable] delete one error", error);
        setError("Kunne ikke slette faktura: " + error.message);
        alert("Kunne ikke slette faktura: " + error.message);
      }

      await load();
    } catch (err: any) {
      console.error("[InvoiceTable] delete one unknown error", err);
      setError("Ukjent feil ved sletting av faktura.");
      alert("Ukjent feil ved sletting av faktura.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteAll() {
    if (
      !window.confirm(
        "Er du sikker på at du vil slette ALLE fakturaer for denne organisasjonen? Dette kan ikke angres."
      )
    ) {
      return;
    }

    setDeletingAll(true);
    setError(null);

    try {
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("org_id", ACTIVE_ORG_ID); // alle fakturaer for denne org

      if (error) {
        console.error("[InvoiceTable] delete all error", error);
        setError("Kunne ikke slette alle fakturaer: " + error.message);
        alert("Kunne ikke slette alle fakturaer: " + error.message);
      }

      await load();
    } catch (err: any) {
      console.error("[InvoiceTable] delete all unknown error", err);
      setError("Ukjent feil ved sletting av alle fakturaer.");
      alert("Ukjent feil ved sletting av alle fakturaer.");
    } finally {
      setDeletingAll(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toppseksjon med knapper */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Fakturadokumenter
          </h2>
          <p className="text-xs text-slate-500">
            Alle fakturaer som er brukt i beregningene.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            disabled={loading}
          >
            {loading ? "Laster…" : "Oppdater"}
          </button>

          <button
            type="button"
            onClick={handleDeleteAll}
            className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-60"
            disabled={deletingAll || loading || rows.length === 0}
          >
            {deletingAll ? "Sletter alle…" : "Slett alle dokumenter"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600">
          {error}
        </p>
      )}

      {/* Tabell */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="py-2 pl-4 pr-2">Dato</th>
              <th className="py-2 px-2">Leverandør</th>
              <th className="py-2 px-2">Fakturanr</th>
              <th className="py-2 px-2 text-right">Beløp</th>
              <th className="py-2 px-2 text-right">Valuta</th>
              <th className="py-2 px-2 text-right">CO₂ (kg)</th>
              <th className="py-2 px-2">Status</th>
              <th className="py-2 pr-4 pl-2 text-right">Handlinger</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="py-2 pl-4 pr-2 whitespace-nowrap">
                  {row.invoice_date}
                </td>
                <td className="py-2 px-2">
                  {row.vendor ?? "–"}
                </td>
                <td className="py-2 px-2">
                  {row.invoice_no ?? "–"}
                </td>
                <td className="py-2 px-2 text-right whitespace-nowrap">
                  {row.total != null
                    ? row.total.toLocaleString("nb-NO", {
                        style: "currency",
                        currency: row.currency || "NOK",
                        maximumFractionDigits: 0,
                      })
                    : "–"}
                </td>
                <td className="py-2 px-2 text-right">
                  {row.currency ?? "NOK"}
                </td>
                <td className="py-2 px-2 text-right">
                  {row.total_co2_kg != null
                    ? Math.round(row.total_co2_kg).toLocaleString("nb-NO")
                    : "–"}
                </td>
                <td className="py-2 px-2">
                  {row.status ?? "–"}
                </td>
                <td className="py-2 pr-4 pl-2 text-right space-x-2 whitespace-nowrap">
                  {row.public_url && (
                    <a
                      href={row.public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-700 hover:underline"
                    >
                      Åpne
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(row.id)}
                    className="text-xs text-red-600 hover:underline disabled:opacity-60"
                    disabled={deletingId === row.id}
                  >
                    {deletingId === row.id ? "Sletter…" : "Slett"}
                  </button>
                </td>
              </tr>
            ))}

            {rows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={8}
                  className="py-6 text-center text-slate-400"
                >
                  Ingen fakturaer funnet.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td
                  colSpan={8}
                  className="py-6 text-center text-slate-400"
                >
                  Laster…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
