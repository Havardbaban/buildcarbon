// src/components/InvoiceUpload.tsx

import React, { useState, useCallback } from "react";
import Tesseract from "tesseract.js";
import { supabase } from "../lib/supabase";
import { v4 as uuidv4 } from "uuid";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import parseInvoice from "../lib/invoiceParser";
import saveDocumentLinesWithCo2 from "../lib/saveDocumentLinesWithCo2";

export default function InvoiceUpload({
  onUploadComplete,
}: {
  onUploadComplete?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const processInvoice = useCallback(async () => {
    if (!file) {
      setError("Please select a file.");
      return;
    }

    setUploading(true);
    setError(null);
    setProgress("Uploading file...");

    try {
      const fileId = uuidv4();
      const fileExt = file.name.split(".").pop();
      const storagePath = `invoices/${fileId}.${fileExt}`;

      // 1) Last opp fila til Supabase Storage (bucket: invoices)
      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(storagePath, file);

      if (uploadError) {
        console.error("Supabase upload error:", uploadError);
        if (
          uploadError.message.includes("not found") ||
          uploadError.message.includes("bucket")
        ) {
          setError(
            "Storage bucket 'invoices' not found. Check Supabase Dashboard > Storage and ensure it is public."
          );
        } else {
          setError(`Upload failed: ${uploadError.message}`);
        }
        setUploading(false);
        return;
      }

      setProgress("Processing file with OCR...");

      // 2) OCR – hent tekst fra PDF eller bilde
      let ocrText = "";

      if (file.type === "application/pdf") {
        const pages = await pdfToPngBlobs(file);
        for (let i = 0; i < pages.length; i++) {
          setProgress(`Scanning page ${i + 1}/${pages.length}...`);
          const result = await Tesseract.recognize(pages[i], "eng", {
            logger: (m) => {
              if (m.status === "recognizing text") {
                setProgress(
                  `Scanning page ${i + 1}: ${Math.round(m.progress * 100)}%`
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
        setError("Unsupported file type. Please upload a PDF or image file.");
        setUploading(false);
        return;
      }

      // 3) Parse fakturateksten til strukturert data
      setProgress("Extracting invoice data...");
      const parsed = await parseInvoice(ocrText);

      // 4) Lagre én rad i `document`
      setProgress("Saving to database...");

      const { data: docRow, error: docError } = await supabase
        .from("document")
        .insert([
          {
            // org_id kan være null i MVP
            org_id: null,
            external_id: fileId, // intern referanse til fila
            supplier_name: parsed.vendor ?? null, // hvis kolonnen heter supplier_name
            supplier_org_number: parsed.orgNumber ?? null, // hvis denne finnes hos deg
            issue_date: parsed.dateISO ?? null,
            total_amount: parsed.total ?? null,
            currency: parsed.currency ?? "NOK",
            co2_kg: parsed.co2Kg ?? null,
            energy_kwh: parsed.energyKwh ?? null,
            fuel_liters: parsed.fuelLiters ?? null,
            gas_m3: parsed.gasM3 ?? null,
            file_path: storagePath, // eksisterer i tabellen din
          },
        ])
        .select("id")
        .single();

      if (docError) {
        console.error("DB error on document:", docError);
        setError(`Database error: ${docError.message}`);
        setUploading(false);
        return;
      }

      const documentId = docRow?.id as string | undefined;

      // 5) Lagre linjeartikler i `document_line` med CO₂
      if (documentId && parsed.lines && parsed.lines.length > 0) {
        try {
          await saveDocumentLinesWithCo2(supabase, documentId, parsed.lines);
        } catch (lineErr) {
          console.error("Failed to insert document_line rows:", lineErr);
          // vi stopper ikke hele prosessen, men logger feilen
        }
      }

      // 6) Ferdig!
      setProgress("Invoice processed successfully!");
      setFile(null);

      // si ifra til parent (InvoicesPage) at vi er ferdige – den laster lista på nytt
      if (onUploadComplete) {
        onUploadComplete();
      }

      setTimeout(() => {
        setProgress("");
        setUploading(false);
      }, 1500);
    } catch (err: any) {
      console.error("Fatal error in processInvoice:", err);
      setError(`Error: ${err.message || String(err)}`);
      setUploading(false);
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
          {uploading ? "Processing..." : "Upload & Scan Invoice"}
        </button>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">
          What we extract:
        </h3>
        <ul className="text-xs text-slate-600 space-y-1">
          <li>Vendor / supplier name</li>
          <li>Invoice date (and later invoice number)</li>
          <li>Total amount</li>
          <li>Automatic CO₂ calculation based on energy/fuel usage</li>
        </ul>
      </div>
    </div>
  );
}
