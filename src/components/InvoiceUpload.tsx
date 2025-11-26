// src/components/InvoiceUpload.tsx

import React, { useState, useCallback } from "react";
import Tesseract from "tesseract.js";
import { v4 as uuidv4 } from "uuid";

import { supabase } from "../lib/supabase";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import parseInvoice from "../lib/invoiceParser";
import saveDocumentLinesWithCo2 from "../lib/saveDocumentLinesWithCo2";

type Props = {
  onUploadComplete?: () => void;
};

export default function InvoiceUpload({ onUploadComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setError(null);
    setProgress("");
  };

  const runOcrOnFile = useCallback(
    async (f: File): Promise<string> => {
      let ocrText = "";

      // PDF → konverter sider til PNG, kjør Tesseract per side
      if (f.type === "application/pdf") {
        const pages = await pdfToPngBlobs(f);

        for (let i = 0; i < pages.length; i++) {
          setProgress(`Scanning page ${i + 1}/${pages.length}…`);

          const result = await Tesseract.recognize(pages[i], "eng", {
            logger: (m) => {
              if (m.status === "recognizing text") {
                setProgress(
                  `Scanning page ${i + 1}/${pages.length}: ${Math.round(
                    m.progress * 100
                  )}%`
                );
              }
            },
          });

          ocrText += result.data.text + "\n";
        }
      }
      // Bilder (PNG/JPG osv.)
      else if (f.type.startsWith("image/")) {
        const result = await Tesseract.recognize(f, "eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(`Scanning: ${Math.round(m.progress * 100)}%`);
            }
          },
        });

        ocrText = result.data.text;
      } else {
        throw new Error(
          "Unsupported file type. Please upload a PDF or image file."
        );
      }

      return ocrText;
    },
    []
  );

  const processInvoice = useCallback(async () => {
    if (!file) {
      setError("Please select a file.");
      return;
    }

    setUploading(true);
    setError(null);
    setProgress("Uploading file to storage…");

    try {
      // 1) Last opp fil til Supabase Storage (bucket: invoices)
      const fileId = uuidv4();
      const ext = file.name.split(".").pop() || "pdf";
      const storagePath = `invoices/${fileId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(storagePath, file);

      if (uploadError) {
        console.error("Supabase storage upload error:", uploadError);
        setError(`Upload failed: ${uploadError.message}`);
        setUploading(false);
        return;
      }

      // 2) OCR
      setProgress("Running OCR on file…");
      const ocrText = await runOcrOnFile(file);

      // 3) Parse faktura
      setProgress("Parsing invoice data…");
      const parsed = await parseInvoice(ocrText);

      // 4) Sett inn rad i document-tabellen
      setProgress("Saving invoice to database…");

      const { data: docRow, error: docError } = await supabase
        .from("document")
        .insert([
          {
            // metadata
            supplier_name: parsed.vendor ?? null,

            // dato og beløp
            issue_date: parsed.dateISO ?? null,
            total_amount: parsed.total ?? null,
            currency: parsed.currency ?? "NOK",

            // aktivitetsdata / klima
            co2_kg: parsed.co2Kg ?? null,
            energy_kwh: parsed.energyKwh ?? null,
            fuel_liters: parsed.fuelLiters ?? null,
            gas_m3: parsed.gasM3 ?? null,

            // referanse til fil i storage (KUN hvis du vet kolonnen finnes)
            // hvis du får feil på denne, kan du bare fjerne linjen
            file_path: storagePath,
          },
        ])
        .select("id")
        .single();

      if (docError) {
        console.error("Failed to insert into document:", docError);
        setError(`Database error: ${docError.message}`);
        setUploading(false);
        return;
      }

      const documentId = docRow?.id as string | undefined;

      // 5) Lagre linjeartikler i document_line med beregnet CO₂ (hvis vi fant noen)
      if (documentId && parsed.lines && parsed.lines.length > 0) {
        setProgress("Saving line items with CO₂ estimates…");

        try {
          await saveDocumentLinesWithCo2(supabase, documentId, parsed.lines);
        } catch (lineErr: any) {
          // Ikke krasj hele prosessen om linjer feiler – logg og gå videre
          console.error("Failed to insert document_line rows:", lineErr);
        }
      }

      setProgress("Invoice processed successfully!");
      setFile(null);

      if (onUploadComplete) {
        onUploadComplete();
      }

      setTimeout(() => {
        setProgress("");
        setUploading(false);
      }, 1500);
    } catch (e: any) {
      console.error("Fatal error in processInvoice:", e);
      setError(e?.message ?? "Unexpected error while processing invoice");
      setUploading(false);
    }
  }, [file, onUploadComplete, runOcrOnFile]);

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
            disabled={uploading}
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
          disabled={!file || uploading}
          className="w-full rounded-xl px-4 py-3 bg-green-600 text-white font-medium
            hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors"
        >
          {uploading ? "Processing…" : "Upload & Scan Invoice"}
        </button>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">
          What we extract:
        </h3>
        <ul className="text-xs text-slate-600 space-y-1">
          <li>Vendor / supplier name</li>
          <li>Invoice date (and number, when recognised)</li>
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
