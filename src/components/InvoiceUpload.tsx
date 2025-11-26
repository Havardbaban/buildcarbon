// src/components/InvoiceUpload.tsx
import React, { useState, useCallback } from "react";
import Tesseract from "tesseract.js";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../lib/supabase";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import parseInvoice from "../lib/invoiceParser";

type UploadState = "idle" | "uploading" | "ocr" | "saving" | "done";

export default function InvoiceUpload({
  onUploadComplete,
}: {
  onUploadComplete?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setError(null);
    setProgress("");
    setState("idle");
  };

  const processInvoice = useCallback(async () => {
    if (!file) {
      setError("Please select a file.");
      return;
    }

    try {
      setError(null);
      setState("uploading");
      setProgress("Uploading file to storage…");

      const fileId = uuidv4();
      const ext = file.name.split(".").pop() || "pdf";
      const storagePath = `invoices/${fileId}.${ext}`;

      // 1) Last opp til Supabase Storage (bucket: invoices)
      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(storagePath, file);

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        setError(`Upload failed: ${uploadError.message}`);
        setState("idle");
        return;
      }

      // 2) OCR med Tesseract
      setState("ocr");
      setProgress("Running OCR on invoice…");
      let ocrText = "";

      if (file.type === "application/pdf") {
        const pages = await pdfToPngBlobs(file);
        for (let i = 0; i < pages.length; i++) {
          setProgress(`Scanning page ${i + 1} of ${pages.length}…`);
          const result = await Tesseract.recognize(pages[i], "eng", {
            logger: (m) => {
              if (m.status === "recognizing text") {
                setProgress(
                  `Scanning page ${i + 1}: ${Math.round(
                    m.progress * 100
                  )}%`
                );
              }
            },
          });
          ocrText += result.data.text + "\n";
        }
      } else if (file.type.startsWith("image/")) {
        const result = await Tesseract.recognize(file, "eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(`Scanning: ${Math.round(m.progress * 100)}%`);
            }
          },
        });
        ocrText = result.data.text;
      } else {
        setError("Unsupported file type. Please upload a PDF or image.");
        setState("idle");
        return;
      }

      // 3) Parse fakturaen
      setProgress("Extracting invoice data…");
      const parsed = await parseInvoice(ocrText);

      // 4) Lagre i document-tabellen
      setState("saving");
      setProgress("Saving invoice to database…");

      const { data: doc, error: dbError } = await supabase
        .from("document")
        .insert({
          // org_id kan være null i dev
          org_id: null,

          external_id: storagePath,
          file_path: storagePath,

          // matcher kolonnene i document-tabellen din
          supplier_name: parsed.vendor ?? "Unknown",
          supplier_orgnr: parsed.orgNumber ?? null,

          issue_date: parsed.dateISO ?? null,
          total_amount: parsed.total ?? null,
          currency: parsed.currency ?? "NOK",

          co2_kg: parsed.co2Kg ?? null,
          energy_kwh: parsed.energyKwh ?? null,
          fuel_liters: parsed.fuelLiters ?? null,
          gas_m3: parsed.gasM3 ?? null,
        })
        .select("*")
        .single();

      if (dbError) {
        console.error("DB insert error:", dbError);
        setError(`Database error: ${dbError.message}`);
        setState("idle");
        return;
      }

      console.log("Inserted document row:", doc);

      setState("done");
      setProgress("Invoice processed successfully!");
      setFile(null);

      if (onUploadComplete) onUploadComplete?.();

      setTimeout(() => {
        setProgress("");
        setState("idle");
      }, 1500);
    } catch (e: any) {
      console.error("Fatal error in processInvoice:", e);
      setError(e?.message ?? "Unexpected error while processing invoice.");
      setState("idle");
    }
  }, [file, onUploadComplete]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold mb-4">Upload Invoice</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Select Invoice (PDF or Image)
          </label>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={handleFileChange}
            disabled={state !== "idle"}
            className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-xl file:border-0
              file:text-sm file:font-semibold
              file:bg-green-50 file:text-green-700
              hover:file:bg-green-100
              disabled:opacity-50"
          />
        </div>

        {file && (
          <div className="text-sm text-slate-600">
            Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {progress && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
            {progress}
          </div>
        )}

        <button
          onClick={processInvoice}
          disabled={!file || state !== "idle"}
          className="w-full rounded-xl px-4 py-3 bg-green-600 text-white font-medium
            hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors"
        >
          {state === "idle" && "Upload & Scan Invoice"}
          {state === "uploading" && "Uploading…"}
          {state === "ocr" && "Scanning…"}
          {state === "saving" && "Saving…"}
          {state === "done" && "Done!"}
        </button>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">
          What we extract:
        </h3>
        <ul className="text-xs text-slate-600 space-y-1">
          <li>Vendor / supplier name</li>
          <li>Invoice date &amp; org number (where found)</li>
          <li>Total amount and currency</li>
          <li>
            Automatic CO₂ calculation based on detected energy / fuel / gas
            usage
          </li>
        </ul>
      </div>
    </div>
  );
}
