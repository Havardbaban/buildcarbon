// src/pages/Invoices.tsx
import React from "react";
import InvoiceUpload from "../components/InvoiceUpload";
import InvoiceTable from "../components/InvoiceTable";

export default function InvoicesPage() {
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
          PDF eller bilde. Systemet leser teksten, beregner CO₂ og lagrer på Demo Org.
        </p>
        <InvoiceUpload />
      </section>

      {/* Dokumentliste */}
      <section className="border border-slate-200 rounded-xl bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-medium">Dokumenter</h2>
          <span className="text-xs text-slate-500">
            Oversikt over alle faktura-dokumenter
          </span>
        </div>
        <InvoiceTable />
      </section>
    </div>
  );
}
