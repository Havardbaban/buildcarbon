// src/components/InvoiceUpload.tsx
import React, { useState } from "react";
import Tesseract from "tesseract.js";
import { supabase } from "../lib/supabase";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import { parseInvoiceLines } from "../lib/parseInvoiceLines";
import { ACTIVE_ORG_ID } from "../lib/org";
import {
  estimateEmissionsKg,
  inferCategory,
  categoryToScope,
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

export default function InvoiceUpload() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  function handleFileSelect(files: FileList | File[]) {
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
    if (file.type === "application/pdf") {
      const blobs = await pdfToPngBlobs(file);
      let fullText = "";
      for (let i = 0; i < blobs.length; i++) {
        const blob = blobs[i];
        const { data } = await Tesseract.recognize(blob, "nor+eng", {
          logger: (m) => {
            if (m.status === "recognizing text" && m.progress != null) {
              const pageProgress = (i + m.progress) / blobs.length;
              onProgress(Math.round(pageProgress * 100));
            }
          },
        });
        fullText += "\n" + data.text;
      }
      return fullText;
    } else {
      const { data } = await Tesseract.recognize(file, "nor+eng", {
        logger: (m) => {
          if (m.status === "recognizing text" && m.progress != null) {
            onProgress(Math.round(m.progress * 100));
          }
        },
      });
      return data.text;
    }
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

      // Extract structured info from text (your existing helper)
      const parsed = parseInvoiceLines(ocrText);
      // Expected: { vendor, invoiceNumber, amountNok, currency, invoiceDate }

      const amountNok = parsed.amountNok ?? 0;
      const category = inferCategory(parsed.vendor ?? "", ocrText);
      const scope = categoryToScope(category);
      const totalCo2Kg = estimateEmissionsKg({ amountNok, category });

      const { data, error } = await supabase.from("invoices").insert([
        {
          org_id: ACTIVE_ORG_ID,
          vendor: parsed.vendor ?? "Unknown vendor",
          invoice_number: parsed.invoiceNumber ?? null,
          invoice_date: parsed.invoiceDate ?? null,
          amount_nok: amountNok,
          currency: parsed.currency ?? "NOK",
          total_co2_kg: totalCo2Kg,
          category,
          scope,
          status: "parsed",
          ocr_text: ocrText,
          // you can also store file_url if you upload the file to storage first
        },
      ]);

      if (error) throw error;

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: "done",
                progress: 100,
                message: `Saved. CO₂: ${totalCo2Kg.toFixed(1)} kg`,
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
                message: err.message ?? "Unexpected error",
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
      <div
        className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) {
            handleFileSelect(e.dataTransfer.files);
          }
        }}
      >
        <p className="mb-2 font-semibold">Last opp fakturaer</p>
        <p className="mb-4 text-sm text-gray-500">
          Slipp filer her, eller klikk for å velge. Vi leser norsk og engelsk, og
          beregner CO₂ automatisk.
        </p>
        <label className="cursor-pointer rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow">
          Velg filer
          <input
            type="file"
            multiple
            className="hidden"
            accept="application/pdf,image/*"
            onChange={(e) => {
              if (e.target.files) handleFileSelect(e.target.files);
            }}
          />
        </label>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Kø</h3>
            <button
              className="rounded-full bg-emerald-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
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
                        ? "text-emerald-600"
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
                    className="h-full rounded-full bg-emerald-500 transition-all"
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
