// src/pages/Documents.tsx
import React from "react";
import InvoiceTable from "../components/InvoiceTable";

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <header className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-semibold">Dokumenter</h1>
        <p className="text-sm text-slate-600">
          Alle faktura-dokumenter som er brukt i beregningene.
        </p>
      </header>

      <InvoiceTable />
    </div>
  );
}
