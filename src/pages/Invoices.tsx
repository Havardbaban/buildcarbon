// src/pages/Invoices.tsx
import React, { useState } from "react";
import InvoiceUpload from "../components/InvoiceUpload";
import InvoiceTable from "../components/InvoiceTable";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";

export default function InvoicesPage() {
  const [deletingAll, setDeletingAll] = useState(false);

  async function handleDeleteAll() {
    if (
      !confirm(
        "Er du sikker på at du vil slette ALLE fakturaer for denne organisasjonen?"
      )
    ) {
      return;
    }

    setDeletingAll(true);
    console.log("[DeleteAll] starter sletting for org", ACTIVE_ORG_ID);

    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("org_id", ACTIVE_ORG_ID);

    if (error) {
      console.error("[DeleteAll] FEIL ved sletting:", error);
      alert("Kunne ikke slette fakturaer: " + error.message);
      setDeletingAll(false);
      return;
    }

    console.log("[DeleteAll] sletting OK");
    setDeletingAll(false);
    // ESG/Dashboard/Dokumenter vil oppdatere seg via realtime når delete faktisk går igjennom
  }

  return (
    <div className="space-y-6">
      <header className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-semibold">Fakturaer</h1>
        <p className="text-sm text-slate-600">
          Last opp nye fakturaer og se alle dokumentene som brukes i beregningene.
        </p>
      </header>

      {/* Opplasting */}
      <section className="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
        <h2 className="text-lg font-medium mb-2">Last opp faktura</h2>
        <p className="text-xs text-slate-500 mb-3">
          PDF eller bilde. Systemet leser teksten, beregner CO₂ og lagrer på Demo
          Org.
        </p>
        <InvoiceUpload />
      </section>

      {/* Dokumentliste */}
      <section className="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-medium">Dokumenter</h2>
            <span className="text-xs text-slate-500">
              Oversikt over alle faktura-dokumenter.
            </span>
          </div>
          <button
            onClick={handleDeleteAll}
            disabled={deletingAll}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {deletingAll ? "Sletter alle…" : "Slett alle fakturaer"}
          </button>
        </div>

        <InvoiceTable />
      </section>
    </div>
  );
}
