// src/components/InvoiceUpload.tsx
import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import { runExternalOcr } from "../lib/externalOcr";
import { saveDocumentLinesWithCo2 } from "../lib/saveDocumentLinesWithCo2";

type UploadState = "idle" | "uploading" | "ocr" | "saving" | "done" | "error";

export default function InvoiceUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
    setProgress("");
    setState("idle");
  }

  async function processInvoice() {
    if (!file) {
      setError("Velg en PDF eller et bilde først.");
      return;
    }

    try {
      // 1) Last opp fil til Supabase storage
      setState("uploading");
      setProgress("Laster opp fil til lagring...");

      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const storagePath = `invoices/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(storagePath, file);

      if (uploadError) {
        setError("Opplasting feilet: " + uploadError.message);
        setState("error");
        return;
      }

      // 2) Kjør ekstern OCR (Mindee) via runExternalOcr
      setState("ocr");
      setProgress("Sender faktura til OCR-tjeneste...");

      const parsed = await runExternalOcr(file, (msg) => setProgress(msg));

      // 3) Lagre dokument i document-tabellen
      setState("saving");
      setProgress("Lagrer faktura i databasen...");

      const { data, error: dbError } = await supabase
        .from("document")
        .insert([
          {
            org_id: ACTIVE_ORG_ID,
            external_id: storagePath,
            file_path: storagePath,
            supplier_name: parsed.vendor ?? "Ukjent leverandør",
            supplier_orgnr: parsed.orgNumber ?? null,
            issue_date: parsed.dateISO ?? null,
            total_amount: parsed.total ?? null,
            currency: parsed.currency ?? "NOK",
            co2_kg: parsed.co2Kg ?? null,
          },
        ])
        .select("id")
        .single();

      if (dbError) {
        setError("Database-feil: " + dbError.message);
        setState("error");
        return;
      }

      const documentId = data?.id as string | undefined;

      if (documentId && parsed.lines.length > 0) {
        await saveDocumentLinesWithCo2(documentId, parsed.lines);
      }

      setState("done");
      setProgress("Faktura prosessert og lagret!");
      setError(null);

      // 🔔 GI BESKJED TIL ALLE SIDER AT DET HAR KOMMET NYE DATA
      window.dispatchEvent(new CustomEvent("invoice:updated"));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Ukjent feil under prosessering.");
      setState("error");
    }
  }

  const busy =
    state === "uploading" || state === "ocr" || state === "saving";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={onFileChange}
        />
        <button
          onClick={processInvoice}
          disabled={!file || busy}
          className={`px-4 py-2 rounded text-white text-sm ${
            busy
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-700"
          }`}
        >
          Prosesser faktura
        </button>
      </div>

      <div className="text-xs text-slate-600 space-y-1">
        <div>Status: {state}</div>
        {progress && <div>{progress}</div>}
        {error && <div className="text-red-600">{error}</div>}
        {state === "done" && !error && (
          <div className="text-emerald-700">Faktura prosessert og lagret!</div>
        )}
      </div>
    </div>
  );
}
