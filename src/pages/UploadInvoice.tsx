// src/pages/UploadInvoice.tsx
import React from "react";
import InvoiceUpload from "../components/InvoiceUpload";

export default function UploadInvoicePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-2">Last opp faktura</h1>
      <p className="text-sm text-slate-600 mb-4">
        Velg en PDF eller et bilde av en faktura. Systemet leser teksten, beregner CO₂
        og lagrer den på Demo Org.
      </p>

      <InvoiceUpload />
    </main>
  );
}
