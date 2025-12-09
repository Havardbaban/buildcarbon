// src/pages/Invoices.tsx
import React from "react";
import InvoiceUpload from "../components/InvoiceUpload";
import InvoiceTable from "../components/InvoiceTable";

export default function InvoicesPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Fakturaer</h1>
        <p className="text-sm text-gray-600">
          Last opp nye fakturaer og se alle dokumenter som inngår i beregningene.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="text-lg font-medium mb-2">Last opp faktura</h2>
          <InvoiceUpload />
        </section>

        <section className="border rounded-lg p-4 bg-white shadow-sm">
          <h2 className="text-lg font-medium mb-2">Dokumenter</h2>
          <InvoiceTable />
        </section>
      </div>
    </div>
  );
}
