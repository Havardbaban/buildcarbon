// src/components/InvoiceUpload.tsx
import React, { useState } from "react";
import Tesseract from "tesseract.js";
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
  progress: number; // 0–100
  message?: string;
};

// ---- simple helpers to pull data out of OCR text -----------------

function extractAmountNok(text: string): number {
  // Look for numbers like "9 765 815,00", "62 100 158 617,00", "1 111,00" etc.
  const haystack = text.replace(/\u00A0/g, " "); // non-breaking spaces

  const nokPatterns: RegExp[] = [
    /(\d{1,3}(?:[ .]\d{3})*,\d{2})\s*(?:kr|nok)/gi,
    /(\d{1,3}(?:[ .]\d{3})*,\d{2})/gi, // any amount with comma
  ];

  const candidates: number[] = [];

  for (const pattern of nokPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(haystack)) !== null) {
      const raw = match[1];
      const normalized = raw.replace(/[ .]/g, "").replace(",", ".");
      const value = parseFloat(normalized);
      if (!Number.isNaN(value)) {
        candidates.push(value);
      }
    }
  }

  if (!candidates.length) return 0;

  // take the largest as total invoice amount
  const max = Math.max(...candidates);
  return max;
}

function extractVendor(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "Unknown vendor";

  // heuristics: first non-header-looking line
  for (const line of lines) {
    if (line.match(/faktura/i)) continue;
    if (line.length < 3) continue;
    return line.slice(0, 120);
  }

  return "Unknown vendor";
}

function extractInvoiceDate(text: string): string | null {
  // match formats like 11.08.2025, 5.12.2025 etc.
  const match =
    text.match(
      /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/
    );
  if (!match) return null;
  const d = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  let y = parseInt(match[3], 10);
  if (y < 100) y += 2000;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(
    2,
    "0"
  )}`;
  return iso;
}

// -----------------------------------------------------------------

export default function InvoiceUpload() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  function addFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    const mapped: UploadItem[] = fileArray.map((file) => ({
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

  async function ocrFile(file: File, onProgress: (p: number) => void) {
    const { data } = await Tesseract.recognize(file, "nor+eng", {
      logger: (m) => {
        if (m.status === "recognizing text" && m.progress != null) {
          onProgress(Math.round(m.progress * 100));
        }
      },
    });
    return data.text;
  }

  async function processItem(item: UploadItem) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, status: "processing", progress: 5 } : it
      )
    );

    try {
      const ocrText = await ocrFile(item.file, (p) => {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, progress: Math.max(it.progress, p) } : it
          )
        );
      });

      const vendor = extractVendor(ocrText);
      const invoiceDate = extractInvoiceDate(ocrText);
      const amountNok = extractAmountNok(ocrText); // <- key fix

      const category = inferCategory(vendor, ocrText);
      const scope = categoryToScope(category);
      const totalCo2Kg = estimateEmissionsKg({
        amountNok,
        category,
      });

      const { error } = await supabase.from("invoices").insert([
        {
          org_id: ACTIVE_ORG_ID,
          vendor,
          invoice_date: invoiceDate,
          amount_nok: amountNok || null,
          total_co2_kg: totalCo2Kg || null,
          scope,
          category,
          status: "parsed",
          ocr_text: ocrText,
        },
      ]);

      if (error) {
        console.error(error);
        throw error;
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: "done",
                progress: 100,
                message: `Saved. CO₂: ${totalCo2Kg.toFixed(
                  1
                )} kg • Amount: ${amountNok.toFixed(2)} NOK`,
              }
            : it
        )
      );
    } catch (err: any) {
      console.error(err);
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: "error",
                message: err?.message ?? "Unexpected error",
              }
            : it
        )
      );
    }
  }

  async function handleProcessAll() {
    setIsProcessingAll(true);
    for (const item of items) {
      if (item.status === "pending" || item.status === "error") {
        // eslint-disable-next-line no-await-in-loop
        await processItem(item);
      }
    }
    setIsProcessingAll(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Last opp faktura</h1>
      <p className="text-sm text-gray-500">
        Velg en PDF eller et bilde av en faktura. Systemet leser teksten,
        beregner CO₂ og lagrer den på Demo Org.
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
          Slipp filer her, eller klikk for å velge. Vi leser norsk og engelsk, og
          beregner CO₂ automatisk.
        </p>
        <label className="cursor-pointer rounded-full bg-green-700 px-4 py-2 text-sm font-medium text-white shadow">
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Kø</h2>
            <button
              className="rounded-full bg-green-700 px-4 py-1 text-sm font-medium text-white disabled:opacity-50"
              onClick={handleProcessAll}
              disabled={isProcessingAll}
            >
              {isProcessingAll ? "Behandler…" : "Start behandling"}
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
                  <p className="mt-1 text-xs text-gray-500">{item.message}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
