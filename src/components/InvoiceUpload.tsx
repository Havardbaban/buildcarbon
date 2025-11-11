import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import Tesseract from "tesseract.js";

import supabase from "../lib/supabase";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import parseInvoice from "../lib/invoiceParser";

type Props = {
  onFinished?: () => void;
};

export default function InvoiceUpload({ onFinished }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function ocrBlob(blob: Blob): Promise<string> {
    const { data } = await Tesseract.recognize(blob, "eng");
    return data.text ?? "";
  }

  async function extractTextFromFile(file: File): Promise<string> {
    // Plain text
    if (file.type === "text/plain") {
      return await file.text();
    }

    // PDF -> convert each page to PNG and OCR each
    if (file.type === "application/pdf") {
      const pages = await pdfToPngBlobs(file);
      let combined = "";
      for (let i = 0; i < pages.length; i++) {
        setProgress(`Reading page ${i + 1} of ${pages.length}...`);
        combined += "\n" + (await ocrBlob(pages[i]));
      }
      return combined.trim();
    }

    // Images (png/jpg/jpeg/webp, etc.)
    if (file.type.startsWith("image/")) {
      setProgress("Reading image...");
      return await ocrBlob(file);
    }

    // Fallback: try to read as text
    try {
      return await file.text();
    } catch {
      throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
    }
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setErr(null);
    setBusy(true);
    setProgress("Starting...");

    try {
      const file = files[0];
      const rowId = uuidv4();

      // 1) Insert a placeholder row first
      setProgress("Creating invoice record...");
      const { error: insErr } = await supabase
        .from("invoices")
        .insert({
          id: rowId,
          filename: file.name,
          status: "processing",
        });
      if (insErr) throw insErr;

      // 2) Extract text (OCR when needed)
      setProgress("Extracting text from file...");
      const text = await extractTextFromFile(file);

      // 3) Parse fields from text
      setProgress("Parsing invoice fields...");
      const parsed = await parseInvoice(text);

      // 4) Update the row with parsed data
      setProgress("Saving extracted data...");
      const { error: updErr } = await supabase
        .from("invoices")
        .update({
          vendor: parsed.vendor ?? null,
          invoice_number: parsed.invoiceNumber ?? null,
          date: parsed.dateISO ?? null,
          total: parsed.total ?? null,
          currency: parsed.currency ?? null,
          raw_text: text,
          status: "done",
        })
        .eq("id", rowId);

      if (updErr) throw updErr;

      setProgress("Complete!");
      setBusy(false);
      onFinished?.();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? "Unexpected error");
      setBusy(false);
    }
  };

  return (
    <div className="border p-4 rounded-xl bg-white shadow-sm">
      <h2 className="font-semibold mb-2">Upload Invoice</h2>

      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
        disabled={busy}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {progress && <p className="text-sm text-gray-700 mt-2">{progress}</p>}
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
    </div>
  );
}
