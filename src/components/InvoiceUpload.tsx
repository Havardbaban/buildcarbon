// src/components/InvoiceUpload.tsx
//
// New invoice upload & processing flow using Azure Document Intelligence.
// - User selects multiple files
// - We queue them
// - For each file we call Azure, compute CO₂, and insert a row into Supabase
//

import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import { analyzeInvoiceWithAzure, ParsedInvoice } from "../lib/azureInvoice";

type FileStatus = "pending" | "processing" | "done" | "error";

type UploadItem = {
  id: string;
  file: File;
  name: string;
  status: FileStatus;
  message?: string;
  co2Kg?: number;
  amountNok?: number;
};

export default function InvoiceUpload() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  // ---- file selection ----------------------------------------------------

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !files.length) return;

    const newItems: UploadItem[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()
        .toString(36)
        .slice(2)}`,
      file,
      name: file.name,
      status: "pending",
    }));

    setItems((prev) => [...prev, ...newItems]);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || !files.length) return;

    const newItems: UploadItem[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()
        .toString(36)
        .slice(2)}`,
      file,
      name: file.name,
      status: "pending",
    }));

    setItems((prev) => [...prev, ...newItems]);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  // ---- processing --------------------------------------------------------

  async function processSingleItem(item: UploadItem): Promise<UploadItem> {
    try {
      const parsed: ParsedInvoice = await analyzeInvoiceWithAzure(item.file);

      // Insert into Supabase "invoices" table
      const { error } = await supabase.from("invoices").insert({
        org_id: ACTIVE_ORG_ID,
        vendor: parsed.supplierName,
        customer_name: parsed.customerName,
        invoice_number: parsed.invoiceNumber,
        invoice_date: parsed.invoiceDate, // column is DATE; we pass "YYYY-MM-DD"
        due_date: parsed.dueDate,
        amount_nok: parsed.totalAmountNok,
        currency: parsed.currency,
        total_co2_kg: parsed.co2KgEstimate,
        scope: parsed.scope,
        status: "parsed",
      });

      if (error) {
        console.error("Supabase insert error", error);
        return {
          ...item,
          status: "error",
          message: `Supabase error: ${error.message}`,
        };
      }

      return {
        ...item,
        status: "done",
        co2Kg: parsed.co2KgEstimate,
        amountNok: parsed.totalAmountNok,
        message: `Saved to database – CO₂: ${parsed.co2KgEstimate.toFixed(
          1
        )} kg`,
      };
    } catch (err: any) {
      console.error("Processing error", err);
      return {
        ...item,
        status: "error",
        message: err?.message ?? "Unexpected error",
      };
    }
  }

  async function handleProcessAll() {
    if (isProcessingAll) return;
    if (!items.some((i) => i.status === "pending")) return;

    setIsProcessingAll(true);

    try {
      let updated = [...items];

      for (let i = 0; i < updated.length; i++) {
        const item = updated[i];
        if (item.status !== "pending") continue;

        updated[i] = { ...item, status: "processing", message: "Behandler..." };
        setItems([...updated]);

        const processed = await processSingleItem(updated[i]);
        updated[i] = processed;
        setItems([...updated]);
      }
    } finally {
      setIsProcessingAll(false);
    }
  }

  // ---- UI ----------------------------------------------------------------

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">
          Last opp faktura
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          Velg en PDF eller et bilde av en faktura. Systemet bruker Azure
          Document Intelligence til å lese fakturaen, beregner CO₂ og lagrer
          den på din organisasjon.
        </p>

        <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 p-8">
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <p className="text-lg font-medium text-slate-900">
              Last opp fakturaer
            </p>
            <p className="text-sm text-slate-500 max-w-xl">
              Slipp filer her, eller klikk for å velge. Vi leser norsk og
              engelsk automatisk med Azure OCR og lagrer resultatet.
              <br />
              Støtter PDF, PNG, JPG. Du kan velge mange samtidig.
            </p>

            <label className="mt-4 inline-flex cursor-pointer items-center rounded-full bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700">
              Velg filer
              <input
                type="file"
                accept=".pdf,image/*"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleProcessAll}
              disabled={
                isProcessingAll || !items.some((i) => i.status === "pending")
              }
              className="inline-flex items-center rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isProcessingAll ? "Behandler..." : "Start behandling"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Kø</h2>

        {items.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ingen filer i køen ennå. Last opp fakturaer for å komme i gang.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-900 truncate">
                    {item.name}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {item.status === "pending" && (
                      <span className="text-amber-700">klar</span>
                    )}
                    {item.status === "processing" && (
                      <span className="text-sky-700">behandler…</span>
                    )}
                    {item.status === "done" && (
                      <span className="text-emerald-700">ferdig</span>
                    )}
                    {item.status === "error" && (
                      <span className="text-red-700">feil</span>
                    )}
                  </span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full transition-all ${
                      item.status === "done"
                        ? "w-full bg-emerald-500"
                        : item.status === "processing"
                        ? "w-1/2 bg-sky-400"
                        : item.status === "error"
                        ? "w-full bg-red-400"
                        : "w-1/4 bg-slate-300"
                    }`}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <span>
                    CO₂:{" "}
                    {item.co2Kg != null
                      ? `${item.co2Kg.toFixed(1)} kg`
                      : "–"}
                  </span>
                  <span>
                    Beløp:{" "}
                    {item.amountNok != null
                      ? `${item.amountNok.toLocaleString("nb-NO", {
                          maximumFractionDigits: 2,
                        })} NOK`
                      : "–"}
                  </span>
                  {item.message && (
                    <span className="text-slate-500">• {item.message}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
