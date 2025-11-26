// src/components/InvoiceUpload.tsx
import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import Tesseract from "tesseract.js";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import { parseInvoiceLines } from "../lib/parseInvoiceLines";
import { ACTIVE_ORG_ID } from "../lib/org";

export default function InvoiceUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<
    "idle" | "uploading" | "ocr" | "saving" | "done" | "error"
  >("idle");
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
    setState("idle");
    setProgress("");
  }

  async function processInvoice() {
    if (!file) {
      setError("Velg en PDF eller et bilde først.");
      return;
    }

    try {
      // 1) Last opp til storage
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

      // 2) OCR
      setState("ocr");
      setProgress("Kjører OCR på faktura...");

      let ocrText = "";

      if (ext === "pdf") {
        const blobs = await pdfToPngBlobs(file);
        for (let i = 0; i < blobs.length; i++) {
          const result = await Tesseract.recognize(blobs[i], "eng", {
            logger: (m) => {
              if (m.status === "recognizing text") {
                setProgress(
                  `Side ${i + 1}/${blobs.length}: ${Math.round(
                    m.progress * 100
                  )}%`
                );
              }
            },
          });
          ocrText += result.data.text + "\n";
        }
      } else {
        const result = await Tesseract.recognize(file, "eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(`Skanner: ${Math.round(m.progress * 100)}%`);
            }
          },
        });
        ocrText = result.data.text;
      }

      // 3) Parse faktura
      setProgress("Ekstraherer fakturadata...");
      const parsed = await parseInvoiceLines(ocrText);

      // 4) Lagre i document-tabellen
      setState("saving");
      setProgress("Lagrer faktura i databasen...");

      const { data: doc, error: dbError } = await supabase
        .from("document")
        .insert({
          org_id: ACTIVE_ORG_ID,

          external_id: storagePath,
          file_path: storagePath,

          supplier_name: parsed.vendor ?? "",
          supplier_orgnr: parsed.orgNumber ?? null,

          issue_date: parsed.dateISO ?? null,
          total_amount: parsed.total ?? null,
          currency: parsed.currency ?? "NOK",

          co2_kg: parsed.co2 ?? null,
          energy_kwh: parsed.energyKwh ?? null,
          fuel_liters: parsed.fuelLiters ?? null,
          gas_m3: parsed.gasM3 ?? null,
        })
        .select("*")
        .single();

      if (dbError) {
        console.error("DB error:", dbError);
        setError("Database-feil: " + dbError.message);
        setState("error");
        return;
      }

      console.log("Inserted document:", doc);
      setState("done");
      setProgress("Faktura prosessert og lagret!");
      setFile(null);
    } catch (err: any) {
      console.error(err);
      setError("Uventet feil: " + (err?.message ?? String(err)));
      setState("error");
    }
  }

  return (
    <div className="p-4 border rounded-xl bg-white shadow-sm">
      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={onFileChange}
        />

        <button
          onClick={processInvoice}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          disabled={!file || state === "uploading" || state === "ocr" || state === "saving"}
        >
          Prosesser faktura
        </button>

        {state !== "idle" && (
          <div className="mt-2 text-sm text-slate-700">
            <div>Status: {state}</div>
            <div>{progress}</div>
          </div>
        )}
      </div>
    </div>
  );
}
