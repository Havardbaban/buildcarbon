// src/components/InvoiceUpload.tsx
import React, { useState, useCallback } from "react";
import Tesseract from "tesseract.js";
import { supabase } from "../lib/supabase";
import { v4 as uuidv4 } from "uuid";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import parseInvoice from "../lib/invoiceParser";
import { useNavigate } from "react-router-dom";

export default function InvoiceUpload() {
  const navigate = useNavigate();

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

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(storagePath, file);

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("invoices")
        .getPublicUrl(storagePath);

      // OCR
      setProgress("Scanning file with OCR...");
      let ocrText = "";

      if (file.type === "application/pdf") {
        const pages = await pdfToPngBlobs(file);
        for (let i = 0; i < pages.length; i++) {
          const result = await Tesseract.recognize(pages[i], "eng");
          ocrText += result.data.text + "\n";
        }
      } else {
        const result = await Tesseract.recognize(file, "eng");
        ocrText = result.data.text;
      }

      // Parse structured invoice data
      setProgress("Extracting invoice data...");
      const parsed = await parseInvoice(ocrText);

      // Insert into Supabase
      setProgress("Saving invoice to database...");

      const { data: invoiceRow, error: dbError } = await supabase
        .from("document")
        .insert({
          supplier: parsed.vendor,
          invoice_no: parsed.invoiceNumber,
          issue_date: parsed.dateISO,
          total_amount: parsed.total,
          currency: parsed.currency,
          co2_kg: parsed.co2Kg,
          file_path: storagePath,
          public_url: urlData.publicUrl,
          ocr_text: ocrText,
        })
        .select("id")
        .single();

      if (dbError) {
        setError(`Database error: ${dbError.message}`);
        setUploading(false);
        return;
      }

      const invoiceId = invoiceRow.id;

      // Redirect to invoice detail page
      navigate(`/invoices/${invoiceId}`);

      setProgress("Done!");
      setUploading(false);
      setFile(null);
    } catch (err: any) {
      setError(`Error: ${err.message}`);
      setUploading(false);
    }
  }, [file, navigate]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold mb-4">Upload Invoice</h2>

      <input
        type="file"
        accept="application/pdf,image/*"
        onChange={handleFileChange}
        disabled={uploading}
      />

      {file && (
        <p className="text-sm mt-2 text-slate-600">
          Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
        </p>
      )}

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded mt-3">
          {error}
        </div>
      )}

      {progress && (
        <div className="bg-blue-100 text-blue-700 p-3 rounded mt-3">
          {progress}
        </div>
      )}

      <button
        onClick={processInvoice}
        disabled={!file || uploading}
        className="w-full mt-4 py-3 bg-green-600 text-white rounded-xl"
      >
        {uploading ? "Processing..." : "Upload & Scan Invoice"}
      </button>
    </div>
  );
}
