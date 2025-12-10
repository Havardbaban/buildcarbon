// src/components/InvoiceUpload.tsx
import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import {
  inferCategory,
  categoryToScope,
  estimateEmissionsKg,
} from "../lib/emissions";
import { Client, InvoiceV4 } from "@mindee/client"; // <-- MINDΞEE SDK

const mindeeClient = new Client({
  apiKey: import.meta.env.VITE_MINDEE_API_KEY, // <-- must be set in Vercel
});

type FileStatus = "pending" | "processing" | "done" | "error";

type UploadItem = {
  id: string;
  file: File;
  name: string;
  status: FileStatus;
  progress: number;
  message?: string;
};

export default function InvoiceUpload() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [processing, setProcessing] = useState(false);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const mapped: UploadItem[] = arr.map((file) => ({
      id: `${file.name}-${Math.random().toString(36).slice(2)}`,
      file,
      name: file.name,
      status: "pending",
      progress: 0,
    }));
    setItems((prev) => [...prev, ...mapped]);
  }

  async function processInvoice(item: UploadItem) {
    try {
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id ? { ...x, status: "processing", progress: 10 } : x
        )
      );

      // --- 1) Send PDF to Mindee ---
      const mindeeResponse = await mindeeClient.invoiceV4.parse(item.file);

      const doc = mindeeResponse.document;
      const invoice = doc.inference?.prediction;

      if (!invoice) throw new Error("Mindee returned no invoice fields.");

      const vendor = invoice.supplierName?.value ?? "Unknown vendor";
      const date = invoice.date?.value ?? null;
      const amount = invoice.totalAmount?.value ?? 0;

      // --- 2) CO₂ logic ---
      const category = inferCategory(vendor, JSON.stringify(invoice));
      const scope = categoryToScope(category);
      const totalCo2Kg = estimateEmissionsKg({
        amountNok: amount,
        category,
      });

      // --- 3) Save to Supabase ---
      const { error } = await supabase.from("invoices").insert([
        {
          org_id: ACTIVE_ORG_ID,
          vendor,
          invoice_date: date,
          amount_nok: amount,
          category,
          scope,
          total_co2_kg: totalCo2Kg,
          status: "parsed",
          ocr_text: JSON.stringify(invoice), // store Mindee JSON
        },
      ]);

      if (error) throw error;

      // --- 4) Update UI ---
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? {
                ...x,
                status: "done",
                progress: 100,
                message: `Saved • ${totalCo2Kg.toFixed(1)} kg CO₂`,
              }
            : x
        )
      );
    } catch (err: any) {
      console.error("UPLOAD ERROR:", err);

      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? {
                ...x,
                status: "error",
                message:
                  err?.message ??
                  err?.error_description ??
                  JSON.stringify(err),
              }
            : x
        )
      );
    }
  }

  async function processAll() {
    setProcessing(true);
    for (const item of items) {
      if (item.status === "pending" || item.status === "error") {
        await processInvoice(item);
      }
    }
    setProcessing(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Last opp faktura</h1>

      <div
        className="border border-dashed rounded-2xl bg-gray-50 p-10 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
        }}
      >
        <p className="font-semibold mb-2">Last opp fakturaer</p>
        <p className="text-sm text-gray-500 mb-4">
          Slipp filer her eller velg. Vi bruker Mindee til automatisk faktura-tolkning.
        </p>

        <label className="bg-green-700 text-white px-4 py-2 rounded-full cursor-pointer">
          Velg filer
          <input
            type="file"
            multiple
            className="hidden"
            accept="application/pdf,image/*"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </label>
      </div>

      <button
        className="bg-green-700 text-white px-4 py-2 rounded-full disabled:opacity-50"
        onClick={processAll}
        disabled={processing}
      >
        {processing ? "Behandler…" : "Start behandling"}
      </button>

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="border rounded-xl p-3 text-sm flex flex-col gap-1"
          >
            <div className="flex justify-between">
              <span className="font-medium">{item.name}</span>
              <span
                className={
                  item.status === "done"
                    ? "text-green-700"
                    : item.status === "error"
                    ? "text-red-600"
                    : "text-gray-500"
                }
              >
                {item.status}
              </span>
            </div>

            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-600"
                style={{ width: `${item.progress}%` }}
              />
            </div>

            {item.message && (
              <p className="text-xs text-gray-600">{item.message}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
