import React, { useState } from "react";
import InvoiceTable from "../components/InvoiceTable"; // remove InvoiceUpload


export default function InvoicesPage() {
  const [refreshKey, setRefreshKey] = useState<string>("");

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Invoices</h1>
      <InvoiceUpload onFinished={() => setRefreshKey(String(Date.now()))} />
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-3">Parsed invoices</h2>
        <InvoiceTable refreshKey={refreshKey} />
      </div>
    </div>
  );
}
