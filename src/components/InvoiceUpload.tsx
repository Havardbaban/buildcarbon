import React, { useState, useCallback } from "react";
import Tesseract from "tesseract.js";
import { supabase } from "../lib/supabase";
import { v4 as uuidv4 } from "uuid";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import { parseInvoiceLines } from "../lib/parseInvoiceLines";

type InvoiceData = {
  vendor: string | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  total: number | null;
  currency: string;
  totalCo2Kg: number | null;
};

const CO2_EMISSION_FACTORS: { [key: string]: number } = {
  electricity: 0.028,
  diesel: 2.68,
  petrol: 2.31,
  gas: 2.0,
};

function extractInvoiceData(text: string): InvoiceData {
  const lines = text.split("\n");
  const lowerText = text.toLowerCase();

  let vendor: string | null = null;
  let invoiceNo: string | null = null;
  let invoiceDate: string | null = null;
  let total: number | null = null;
  let currency = "NOK";
  let totalCo2Kg: number | null = null;

  // Finn leverandørnavn (første "fornuftige" linje)
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i].trim();
    if (line.length > 5 && /[A-Z]/.test(line) && !vendor) {
      vendor = line;
      break;
    }
  }

  // Fakturanummer
  const invoiceMatch = text.match(
    /(?:invoice|faktura)\s*(?:no|nr)?[:\s]*([A-Z0-9\-]+)/i
  );
  if (invoiceMatch) invoiceNo = invoiceMatch[1];

  // Dato
  const dateMatch = text.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    invoiceDate = `${fullYear}-${month.padStart(2, "0")}-${day.padStart(
      2,
      "0"
    )}`;
  }

  // Totalbeløp
  const amountMatches = text.match(
    /(?:total|sum|beløp)[:\s]*(?:NOK|kr)?\s*([\d\s,.]+)/gi
  );
  if (amountMatches) {
    for (const match of amountMatches) {
      const numStr = match.replace(/[^\d,.]/g, "");
      const num = parseFloat(numStr.replace(/\s/g, "").replace(",", "."));
      if (!isNaN(num) && num > 0) {
        if (!total || num > total) total = num;
      }
    }
  }

  // Enkel CO2-utregning basert på tekst
  if (
    lowerText.includes("kwh") ||
    lowerText.includes("electricity") ||
    lowerText.includes("strøm")
  ) {
    const kwhMatch = text.match(/([\d\s,.]+)\s*kwh/i);
    if (kwhMatch) {
      const kwh = parseFloat(kwhMatch[1].replace(/\s/g, "").replace(",", "."));
      if (!isNaN(kwh)) {
        totalCo2Kg = kwh * CO2_EMISSION_FACTORS.electricity;
      }
    }
  } else if (lowerText.includes("diesel")) {
    const literMatch = text.match(/([\d\s,.]+)\s*(?:liter|l)\b/i);
    if (literMatch) {
      const liters = parseFloat(
        literMatch[1].replace(/\s/g, "").replace(",", ".")
      );
      totalCo2Kg = liters * CO2_EMISSION_FACTORS.diesel;
    }
  } else if (lowerText.includes("petrol") || lowerText.includes("bensin")) {
    const literMatch = text.match(/([\d\s,.]+)\s*(?:liter|l)\b/i);
    if (literMatch) {
      const liters = parseFloat(
        literMatch[1].replace(/\s/g, "").replace(",", ".")
      );
      totalCo2Kg = liters * CO2_EMISSION_FACTORS.petrol;
    }
  }

  return { vendor, invoiceNo, invoiceDate, total, currency, totalCo2Kg };
}

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

      // LAGRE FIL I SUPABASE STORAGE (bucket: invoices)
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

      const { data: urlData } = supabase.storage
        .from("invoices")
        .getPublicUrl(storagePath);

      setProgress("Processing file with OCR...");

      let ocrText = "";

      // OCR – PDF
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
      }
      // OCR – Bilde
      else if (file.type.startsWith("image/")) {
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

      // Ekstraher strukturert data
      setProgress("Extracting invoice data...");
      const invoiceData = extractInvoiceData(ocrText);

      // LAGRE I invoices-tabellen med dine kolonnenavn
      setProgress("Saving to database...");

      const { data: invoiceRow, error: dbError } = await supabase
        .from("invoices")
        .insert({
          // disse feltene matcher tabellen du har i Supabase
          filename: file.name,
          storage_path: storagePath,
          public_url: urlData.publicUrl,
          status: "parsed", // type: invoice_status
          ocr_text: ocrText,
          supplier: invoiceData.vendor, // tidligere "vendor"
          invoice_date: invoiceData.invoiceDate,
          total_amount: invoiceData.total,
          co2_kg: invoiceData.totalCo2Kg,
          // invoice_no og currency kan du legge til her
          // hvis de finnes som kolonner i schemaet ditt
        })
        .select("id")
        .single();

      if (dbError) {
        console.error("DB error on invoices:", dbError);
        setError(`Database error: ${dbError.message}`);
        setUploading(false);
        return;
      }

      const invoiceId = invoiceRow?.id;

      // LAGRE LINJEARTIKLER I invoice_lines
      if (invoiceId) {
        setProgress("Parsing line items with ESG classification...");

        const lineItems = parseInvoiceLines(ocrText);

        if (lineItems.length > 0) {
          const linesToInsert = lineItems.map((line) => ({
            invoice_id: invoiceId,
            line_number: line.lineNumber,
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            amount: line.amount,
            category: line.category,
            esg_scope: line.esgScope,
            co2_kg: line.co2Kg,
          }));

          const { error: linesError } = await supabase
            .from("invoice_lines")
            .insert(linesToInsert);

          if (linesError) {
            console.error("Failed to insert line items:", linesError);
          }
        }
      }

      setProgress("Invoice processed successfully!");
      setFile(null);

      if (onUploadComplete) onUploadComplete();

      setTimeout(() => {
        setProgress("");
        setUploading(false);
      }, 1500);
    } catch (err: any) {
      console.error("Fatal error in processInvoice:", err);
      setError(`Error: ${err.message}`);
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
          <li>Automatic CO2 calculation based on energy/fuel usage</li>
        </ul>
      </div>
    </div>
  );
}
