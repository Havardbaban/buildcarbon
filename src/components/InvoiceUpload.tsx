import React, { useState } from "react";
import Tesseract from "tesseract.js";
import { supabase } from "../lib/supabase";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import { parseInvoiceLines } from "../lib/parseInvoiceLines";
import { ACTIVE_ORG_ID } from "../lib/org";

type FileStatus = "pending" | "processing" | "done" | "error";

type UploadItem = {
  id: string;
  file: File;
  name: string;
  status: FileStatus;
  progress: number; // 0–100 (per fil)
  message?: string;
};

export default function InvoiceUpload() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  function handleFileSelect(files: File[]) {
    const mapped: UploadItem[] = files.map((file) => ({
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

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    handleFileSelect(Array.from(e.target.files));
    // nullstill input så man kan velge samme fil igjen senere om ønskelig
    e.target.value = "";
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  async function processSingleItem(item: UploadItem) {
    updateItem(item.id, { status: "processing", progress: 5, message: undefined });

    try {
      const file = item.file;

      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

      let imageBlobs: Blob[] = [];

      if (isPdf) {
        // Konverter PDF til PNG per side
        imageBlobs = await pdfToPngBlobs(file);
        if (!imageBlobs.length) {
          throw new Error("Fant ingen sider i PDF-filen.");
        }
      } else {
        // Direkte på bilde
        imageBlobs = [file];
      }

      let fullText = "";
      const pagesCount = imageBlobs.length;

      for (let i = 0; i < pagesCount; i++) {
        const blob = imageBlobs[i];

        const { data } = await Tesseract.recognize(blob, "nor+eng", {
          logger: (m) => {
            // m.progress er 0–1 per side
            if (m.status === "recognizing text") {
              const basePerPage = 70 / pagesCount; // 70% av progresjon allokeres til OCR
              const pageProgress = m.progress * basePerPage;
              const completedPagesProgress = (basePerPage * i);
              const totalProgress = 10 + completedPagesProgress + pageProgress; // start på 10%
              updateItem(item.id, {
                progress: Math.min(95, Math.round(totalProgress)),
              });
            }
          },
        });

        fullText += "\n\n" + data.text;
      }

      if (!fullText.trim()) {
        throw new Error("Ingen tekst funnet i fakturaen.");
      }

      // Parse fakturalinjer / metadata fra OCR-tekst
      const parsed = parseInvoiceLines(fullText);

      // TODO: Tilpass dette til schemaet ditt
      // Eksempel 1: Lagre rå-tekst + metadata i en "invoices_raw"-tabell
      const { error: insertError } = await supabase
        .from("invoices_raw")
        .insert({
          org_id: ACTIVE_ORG_ID,
          file_name: file.name,
          mime_type: file.type,
          ocr_text: fullText,
          parsed_json: parsed, // forutsatt at parseInvoiceLines gir et objekt
        });

      if (insertError) {
        console.error(insertError);
        throw new Error(insertError.message || "Klarte ikke å lagre til Supabase.");
      }

      // Alternativ: Hvis du allerede har tabell for fakturalinjer, kan du heller gjøre:
      // const lines = parsed.lines; // avhengig av format
      // await supabase.from("invoice_lines").insert(
      //   lines.map((line) => ({
      //     ...line,
      //     org_id: ACTIVE_ORG_ID,
      //     source_file_name: file.name,
      //   }))
      // );

      updateItem(item.id, {
        status: "done",
        progress: 100,
        message: "Ferdig",
      });
    } catch (err: any) {
      console.error(err);
      updateItem(item.id, {
        status: "error",
        progress: 100,
        message: err?.message || "Noe gikk galt under behandling.",
      });
    }
  }

  async function handleProcessAll() {
    if (!items.length) return;
    setIsProcessingAll(true);

    // Prosesser sekvensielt (en etter en) for å ikke drepe browseren/kvoten
    for (const item of items) {
      if (item.status === "done") continue; // hopp over allerede ferdige
      await processSingleItem(item);
    }

    setIsProcessingAll(false);
  }

  async function handleProcessSingle(id: string) {
    const item = items.find((x) => x.id === id);
    if (!item) return;
    await processSingleItem(item);
  }

  function handleClearFinished() {
    setItems((prev) => prev.filter((item) => item.status !== "done"));
  }

  function handleClearAll() {
    setItems([]);
  }

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const processingCount = items.filter((i) => i.status === "processing").length;

  return (
    <div className="space-y-6">
      {/* Toppseksjon med opplasting */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Last opp fakturaer
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Dra inn eller velg flere PDF- eller bildefiler. Vi leser norsk og engelsk
          med OCR og lagrer resultatet automatisk.
        </p>

        <div className="mt-4">
          <label
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center transition hover:border-emerald-400 hover:bg-emerald-50/40"
          >
            <span className="text-sm font-medium text-slate-800">
              Slipp filer her, eller klikk for å velge
            </span>
            <span className="mt-1 text-xs text-slate-400">
              Støtter PDF, PNG, JPG. Du kan velge mange samtidig.
            </span>
            <input
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="hidden"
              onChange={onInputChange}
            />
          </label>
        </div>

        {items.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleProcessAll}
              disabled={isProcessingAll || items.length === 0}
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-200"
            >
              {isProcessingAll ? "Behandler alle…" : "Start behandling av alle"}
            </button>

            <button
              onClick={handleClearFinished}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Fjern ferdige
            </button>

            <button
              onClick={handleClearAll}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Nullstill liste
            </button>

            <div className="ml-auto text-xs text-slate-500">
              {pendingCount > 0 && (
                <span className="mr-3">
                  Venter: <span className="font-medium">{pendingCount}</span>
                </span>
              )}
              {processingCount > 0 && (
                <span>
                  Pågår: <span className="font-medium">{processingCount}</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Liste over filer */}
      {items.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              {items.length} fil(er) i kø
            </h3>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900">
                        {item.name}
                      </span>
                      <StatusPill status={item.status} />
                    </div>
                    {item.message && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.message}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => handleProcessSingle(item.id)}
                    disabled={
                      item.status === "processing" ||
                      item.status === "done" ||
                      isProcessingAll
                    }
                    className="ml-3 whitespace-nowrap rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:border-emerald-400 hover:text-emerald-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                  >
                    Kjør kun denne
                  </button>
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: FileStatus }) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";
  if (status === "pending") {
    return (
      <span className={`${base} bg-slate-100 text-slate-600`}>
        Venter
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className={`${base} bg-amber-100 text-amber-700`}>
        Behandler…
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-700`}>
        Ferdig
      </span>
    );
  }
  return (
    <span className={`${base} bg-rose-100 text-rose-700`}>
      Feil
    </span>
  );
}
