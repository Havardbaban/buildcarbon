// src/components/InvoiceUpload.tsx
import React, { useState } from "react";
import processInvoiceUpload from "../lib/processInvoiceUpload";

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

  async function runOne(itemId: string) {
    setItems((prev) =>
      prev.map((x) =>
        x.id === itemId ? { ...x, status: "processing", progress: 10, message: "Analyzing…" } : x
      )
    );

    const item = items.find((x) => x.id === itemId);
    if (!item) return;

    try {
      const res = await processInvoiceUpload({ file: item.file });

      setItems((prev) =>
        prev.map((x) =>
          x.id === itemId
            ? {
                ...x,
                status: "done",
                progress: 100,
                message: `Saved — Beløp: ${res.amountNok} NOK · CO₂: ${res.totalCo2Kg} kg · Lines: ${res.linesCount}`,
              }
            : x
        )
      );
    } catch (e: any) {
      setItems((prev) =>
        prev.map((x) =>
          x.id === itemId
            ? {
                ...x,
                status: "error",
                progress: 100,
                message: e?.message ?? "Ukjent feil",
              }
            : x
        )
      );
    }
  }

  async function runAll() {
    setIsProcessingAll(true);
    try {
      for (const it of items) {
        if (it.status === "done") continue;
        await runOne(it.id);
      }
    } finally {
      setIsProcessingAll(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Last opp fakturaer</div>
          <div className="text-sm text-neutral-600">OCR → invoice + invoice_lines</div>
        </div>

        <button
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          onClick={runAll}
          disabled={isProcessingAll || items.length === 0}
        >
          {isProcessingAll ? "Prosesserer…" : "Prosesser alle"}
        </button>
      </div>

      <input
        type="file"
        multiple
        accept="application/pdf,image/*"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />

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
                    {it.status === "pending"
                      ? "Klar"
                      : it.status === "processing"
                      ? "Prosesserer"
                      : it.status === "done"
                      ? "Ferdig"
                      : "Feil"}
                  </div>
                </div>

                <button
                  className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-60"
                  onClick={() => runOne(it.id)}
                  disabled={isProcessingAll || it.status === "processing"}
                >
                  Kjør
                </button>
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
