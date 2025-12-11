// src/components/InvoiceTable.tsx
import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { useInvoicesRealtime, Invoice } from "../lib/useInvoicesRealtime";

export default function InvoiceTable() {
  const { invoices, loading, error, reload } = useInvoicesRealtime();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  async function handleDeleteOne(id: string) {
    if (!confirm("Slette denne fakturaen?")) return;

    setDeletingId(id);
    const { error } = await supabase.from("invoices").delete().eq("id", id);

    if (error) {
      console.error("[InvoiceTable] delete one error", error);
      alert("Kunne ikke slette faktura: " + error.message);
    }

    setDeletingId(null);
    // backup i tilfelle realtime ikke er helt riktig
    await reload();
  }

  async function handleDeleteAll() {
    if (
      !confirm(
        "Er du sikker på at du vil slette ALLE fakturaer i systemet? Dette kan ikke angres."
      )
    ) {
      return;
    }

    setDeletingAll(true);
    console.log("[InvoiceTable] delete ALL invoices");

    // For pilot: slett absolutt alle invoices, uansett org_id
    const { error } = await supabase
      .from("invoices")
      .delete()
      .not("id", "is", null);

    if (error) {
      console.error("[InvoiceTable] delete all error", error);
      alert("Kunne ikke slette alle fakturaer: " + error.message);
      setDeletingAll(false);
      return;
    }

    setDeletingAll(false);
    await reload();
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Laster fakturaer…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Kunne ikke hente fakturaer: {error}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Antall fakturaer: {invoices.length}
        </p>
        {invoices.length > 0 && (
          <button
            onClick={handleDeleteAll}
            disabled={deletingAll}
            className="rounded bg-red-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {deletingAll ? "Sletter alle…" : "Slett alle fakturaer"}
          </button>
        )}
      </div>

      {invoices.length === 0 ? (
        <p className="text-sm text-slate-500">
          Ingen fakturaer funnet. Last opp fakturaer for å starte.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="py-2 px-2">Dato</th>
                <th className="py-2 px-2">Leverandør</th>
                <th className="py-2 px-2 text-right">Beløp (NOK)</th>
                <th className="py-2 px-2 text-right">CO₂ (kg)</th>
                <th className="py-2 px-2 text-right">Handling</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv: Invoice) => {
                const amount =
                  // noen rader har amount_nok, noen har total
                  (inv as any).amount_nok ??
                  (inv as any).total ??
                  0;

                const co2 = inv.total_co2_kg ?? (inv as any).total_co2_kg ?? 0;

                return (
                  <tr
                    key={inv.id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="py-1 px-2">
                      {inv.invoice_date
                        ? new Date(inv.invoice_date).toLocaleDateString("nb-NO")
                        : "-"}
                    </td>
                    <td className="py-1 px-2">
                      {(inv as any).vendor ?? "Ukjent leverandør"}
                    </td>
                    <td className="py-1 px-2 text-right">
                      {amount.toLocaleString("nb-NO", {
                        style: "currency",
                        currency: "NOK",
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="py-1 px-2 text-right">
                      {co2.toLocaleString("nb-NO", {
                        maximumFractionDigits: 1,
                      })}
                    </td>
                    <td className="py-1 px-2 text-right">
                      <button
                        onClick={() => handleDeleteOne(inv.id)}
                        disabled={deletingId === inv.id}
                        className="text-xs text-red-600 underline disabled:opacity-50"
                      >
                        {deletingId === inv.id ? "Sletter…" : "Slett"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
