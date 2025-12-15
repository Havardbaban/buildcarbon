// src/components/InvoiceUpload.tsx
import React, { useState } from "react";
import { processInvoiceUpload } from "../lib/processInvoiceUpload";

type FileStatus = "pending" | "processing" | "done" | "error";

type UploadItem = {
  id: string;
  file: File;
  name: string;
  status: FileStatus;
  progress: number; // 0-100
  message?: string;
};

export default function InvoiceUpload() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const mapped: UploadItem[] = arr.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file,
      name: file.name,
      status: "pending",
      progress: 0,
    }));
    setItems((prev) => [...mapped, ...prev]);
  }

  async function processOne(itemId: string) {
    const item = items.find((x) => x.id === itemId);
    if (!item) return;

    setItems((prev) =>
      prev.map((x) => (x.id === itemId ? { ...x, status: "processing", progress: 10, message: "Analyzing…" } : x))
    );

    try {
      // This calls OCR + parsing + CO2 + save invoice + save lines
      const res = await processInvoiceUpload(item.file);

      setItems((prev) =>
        prev.map((x) =>
          x.id === itemId
            ? {
                ...x,
                status: "done",
                progress: 100,
                message: `Saved to database — Beløp: ${res.amountNok?.toFixed?.(2) ?? res.amountNok} NOK · CO₂: ${
                  res.totalCo2Kg?.toFixed?.(1) ?? res.totalCo2Kg
                } kg · Lines: ${res.linesCount}`,
              }
            : x
        )
      );
    } catch (e: any) {
      const msg = e?.message ?? JSON.stringify(e);

      setItems((prev) =>
        prev.map((x) =>
          x.id === itemId
            ? {
                ...x,
                status: "error",
                progress: 100,
                message: msg,
              }
            : x
        )
      );
    }
  }

  async function processAll() {
    setIsProcessingAll(true);
    try {
      // process in sequence to avoid rate-limit (429)
      for (const it of items) {
        if (it.status === "done") continue;
        await processOne(it.id);
      }
    } finally {
      setIsProcessingAll(false);
    }
  }

  function removeOne(itemId: string) {
    setItems((prev) => prev.filter((x) => x.id !== itemId));
  }

  function clearDone() {
    setItems((prev) => prev.filter((x) => x.status !== "done"));
  }

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Last opp fakturaer</div>
          <div className="text-sm text-neutral-600">PDF eller bilde. Vi kjører OCR → lagrer invoices + invoice_lines.</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-50"
            onClick={clearDone}
            disabled={items.every((x) => x.status !== "done")}
          >
            Fjern ferdige
          </button>

          <button
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={processAll}
            disabled={isProcessingAll || items.length === 0}
          >
            {isProcessingAll ? "Prosesserer…" : "Prosesser alle"}
          </button>
        </div>
      </div>

      <label className="block">
        <input
          type="file"
          multiple
          accept="application/pdf,image/*"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.currentTarget.value = "";
          }}
        />
      </label>

      {items.length === 0 ? (
        <div className="text-sm text-neutral-600">Ingen filer i kø.</div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{it.name}</div>
                  <div className="text-xs text-neutral-600">
                    Status:{" "}
                    {it.status === "pending"
                      ? "Klar"
                      : it.status === "processing"
                      ? "Prosesserer"
                      : it.status === "done"
                      ? "Ferdig"
                      : "Feil"}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-60"
                    onClick={() => processOne(it.id)}
                    disabled={isProcessingAll || it.status === "processing"}
                  >
                    Kjør
                  </button>

                  <button
                    className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-60"
                    onClick={() => removeOne(it.id)}
                    disabled={it.status === "processing"}
                  >
                    Fjern
                  </button>
                </div>
              </div>

              <div className="mt-2 h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                <div
                  className={`h-full ${
                    it.status === "error" ? "bg-red-500" : it.status === "done" ? "bg-emerald-500" : "bg-emerald-400"
                  }`}
                  style={{ width: `${it.progress}%` }}
                />
              </div>

              {it.message ? <div className="mt-2 text-xs text-neutral-700 whitespace-pre-wrap">{it.message}</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
