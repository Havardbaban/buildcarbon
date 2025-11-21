import { useState } from "react";
import InvoiceUpload from "../components/InvoiceUpload";
import InvoiceTable from "../components/InvoiceTable";

export default function InvoicesPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadComplete = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Invoice Scanner</h1>
      <p className="text-slate-600 mb-8">
        Upload invoices (PDF or images) to automatically extract vendor info, amounts, and calculate CO2 emissions.
      </p>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-1">
          <InvoiceUpload onUploadComplete={handleUploadComplete} />
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold mb-3">How it works</h2>
            <ol className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-semibold">
                  1
                </span>
                <div>
                  <strong>Upload</strong> your invoice as a PDF or image file
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-semibold">
                  2
                </span>
                <div>
                  <strong>OCR processing</strong> extracts text using Tesseract.js
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-semibold">
                  3
                </span>
                <div>
                  <strong>Smart extraction</strong> identifies vendor, invoice number, date, and total
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-semibold">
                  4
                </span>
                <div>
                  <strong>CO2 calculation</strong> automatically estimates emissions based on energy/fuel usage
                </div>
              </li>
            </ol>

            <div className="mt-6 pt-6 border-t border-slate-200">
              <h3 className="text-sm font-semibold mb-2">CO2 Emission Factors</h3>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>Electricity: 0.028 kg CO2/kWh</div>
                <div>Diesel: 2.68 kg CO2/liter</div>
                <div>Petrol: 2.31 kg CO2/liter</div>
                <div>Gas: 2.0 kg CO2/m³</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <InvoiceTable refresh={refreshKey} />
    </main>
  );
}
