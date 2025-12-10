// src/components/InvoiceUpload.tsx
import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import {
  inferCategory,
  categoryToScope,
  estimateEmissionsKg,
} from "../lib/emissions";

type FileStatus = "pending" | "processing" | "done" | "error";

type UploadItem = {
  id: string;
  file: File;
  name: string;
  status: FileStatus;
  progress: number;
  message?: string;
};

const MINDEE_INVOICE_URL =
  "https://api.mindee.net/v1/products/mindee/invoices/v4/predict";

// --- Mindee call (REST API, no extra packages) --------------------

async function parseWithMindee(file: File) {
  const apiKey = import.meta.env.VITE_MINDEE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing VITE_MINDEE_API_KEY. Set it in Vercel environment variables."
    );
  }

  const formData = new FormData();
  formData.append("document", file);

  const res = await fetch(MINDEE_INVOICE_URL, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Mindee error ${res.status}: ${text.slice(0, 200) || res.statusText}`
    );
  }

  const json = await res.json();
  return json;
}

// Helper to safely pull a single value from Mindee field { value: ... }
function getFieldValue(field: any): any {
  if (!field) return undefined;
  if (typeof field.value !== "undefined") return field.value;
  if (Array.isArray(field) && field[0] && typeof field[0].value !== "undefined") {
    return field[0].value;
  }
  return undefined;
}

// -----------------------------------------------------------------

export default function InvoiceUpload() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [processing, setProcessing] = useState(false);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const mapped: UploadItem[] = arr.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()
        .toString(36)
        .slice(2)}`,
      file,
      name: file.name,
      status: "pending",
      progress: 0,
    }));
    setItems((prev) => [...prev, ...mapped]);
  }

  async function processOne(item: UploadItem) {
    setItems((prev) =>
      prev.map((x) =>
        x.id === item.id ? { ...x, status: "processing", progress: 10 } : x
      )
    );

    try {
      // 1) Call Mindee
      const mindeeJson = await parseWithMindee(item.file);

      const prediction =
        mindeeJson?.document?.inference?.prediction ?? mindeeJson?.prediction ?? {};

      const vendor =
        getFieldValue(prediction.supplier_name) ||
        getFieldValue(prediction.supplier) ||
        "Unknown vendor";

      const invoiceDate =
        getFieldValue(prediction.date) || getFieldValue(prediction.invoice_date) || null;

      const amountRaw =
        getFieldValue(prediction.total_amount) ||
        getFieldValue(prediction.total_incl) ||
        getFieldValue(prediction.total_excl) ||
        0;

      const amountNok = typeof amountRaw === "number" ? amountRaw : parseFloat(amountRaw) || 0;

      // 2) CO2 calculation
      const category = inferCategory(vendor, JSON.stringify(prediction));
      const scope = categoryToScope(category);
      const totalCo2Kg = estimateEmissionsKg({
        amountNok,
        category,
      });

      // 3) Save to Supabase
      const { error } = await supabase.from("invoices").insert([
        {
          org_id: ACTIVE_ORG_ID,
          vendor,
          invoice_date: invoiceDate,
          amount_nok: amountNok || null,
          category,
          scope,
          total_co2_kg: totalCo2Kg || null,
          status: "parsed",
          ocr_text: JSON.stringify(prediction),
        },
      ]);

      if (error) {
        throw new Error(error.message ?? "Supabase insert error");
      }

      // 4) Update UI
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? {
                ...x,
                status: "done",
                progress: 100,
                message: `Saved • ${amountNok.toFixed(
                  2
                )} NOK • ${totalCo2Kg.toFixed(1)} kg CO₂`,
              }
            : x
        )
      );
    } catch (err: any) {
      console.error("Invoice upload error:", err);
      const msg =
        typeof err === "string"
          ? err
          : err?.message || err?.error_description || JSON.stringify(err);

      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id
            ? {
                ...x,
                status: "error",
                message: msg,
              }
            : x
        )
      );
    }
  }

  async function handleProcessAll() {
    setProcessing(true);
    for (const item of items) {
      if (item.status === "pending" || item.status === "error") {
        // eslint-disable-next-line no-await-in-loop
        await processOne(item);
      }
    }
    setProcessing(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Last opp faktura</h1>
      <p className="text-sm text-gray-500">
        Velg en PDF eller et bilde av en faktura. Vi bruker Mindee til å lese
        fakturaen, beregner CO₂ og lagrer resultatet.
      </p>

      <div
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) {
            addFiles(e.dataTransfer.files);
          }
        }}
      >
        <p className="mb-2 font-semibold">Last opp fakturaer</p>
        <p className="mb-4 text-sm text-gray-500">
          Slipp filer her, eller klikk for å velge. Du kan laste opp flere
          samtidig.
        </p>
        <label className="cursor-pointer rounded-full bg-green-700 px-4 py-2 text-sm font-medium text-white">
          Velg filer
          <input
            type="file"
            multiple
            className="hidden"
            accept="application/pdf,image/*"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
            }}
          />
        </label>
      </div>

      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Kø</h2>
            <button
              className="rounded-full bg-green-700 px-4 py-1 text-sm font-medium text-white disabled:opacity-50"
              onClick={handleProcessAll}
              disabled={processing}
            >
              {processing ? "Behandler…" : "Start behandling"}
            </button>
          </div>
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border bg-white px-3 py-2 text-sm"
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
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-green-600 transition-all"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                {item.message && (
                  <p className="mt-1 text-xs text-gray-600">{item.message}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
