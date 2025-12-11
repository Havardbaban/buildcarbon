// src/pages/Invoices.tsx
import React from "react";
import InvoiceUpload from "../components/InvoiceUpload";
import InvoiceTable from "../components/InvoiceTable";

export default function InvoicesPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-semibold">Fakturaer</h1>
        <p className="text-sm text-slate-600">
          Last opp nye fakturaer og administrer dokumentene som brukes i beregningene.
        </p>
      </header>

      {/* Opplasting */}
      <section className="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
        <h2 className="text-lg font-medium mb-2">Last opp faktura</h2>
        <p className="text-xs text-slate-500 mb-3">
          Last opp PDF eller bilde. Systemet leser teksten, beregner CO₂ og lagrer i databasen.
        </p>
        <InvoiceUpload />
      </section>

      {/* Faktura-tabell */}
      <section className="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
        <InvoiceTable />
      </section>
    </div>
  );
}
