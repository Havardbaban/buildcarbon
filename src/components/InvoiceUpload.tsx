import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import Tesseract from "tesseract.js";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import { parseInvoiceLines } from "../lib/parseInvoiceLines";
import { ACTIVE_ORG_ID } from "../lib/org"; // <-- Multi-org støtte

export default function InvoiceUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "uploading" | "ocr" | "saving" | "done" | "error">("idle");
  const [progress, setProgress] = useState<string>("");

  const [error, setError] = useState<string | null>(null);

  // Handle file selection
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
  }

  // Main process
  async function processInvoice() {
    if (!file) {
      setError("Please select a PDF or image file.");
      return;
    }

    setState("uploading");
    setProgress("Uploading file...");

    try {
      // 1. Upload to storage
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `invoices/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(path, file);

      if (uploadError) {
        setError("Upload failed: " + uploadError.message);
        setState("error");
        return;
      }

      // 2. OCR the file
      setState("ocr");
      setProgress("Processing OCR...");

      let text = "";
      if (ext === "pdf") {
        const blobs = await pdfToPngBlobs(file);
        for (let i = 0; i < blobs.length; i++) {
          const result = await Tesseract.recognize(blobs[i], "eng", {
            logger: (m) => {
              if (m.status === "recognizing text") {
                setProgress(`OCR page ${i + 1}/${blobs.length}: ${Math.round(m.progress * 100)}%`);
              }
            },
          });
          text += result.data.text + "\n";
        }
      } else {
        const result = await Tesseract.recognize(file, "eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(`Scanning: ${Math.round(m.progress * 100)}%`);
            }
          },
        });
        text = result.data.text;
      }

      // 3. Parse invoice
      setProgress("Extracting invoice data...");
      const parsed = await parseInvoiceLines(text);

      // 4. Save to database
      setState("saving");
      setProgress("Saving invoice to database...");

      const { data: doc, error: dbError } = await supabase
        .from("document")
        .insert({
          org_id: ACTIVE_ORG_ID, // <-- Multi-org

          external_id: path,
          file_path: path,

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
        setError("Database error: " + dbError.message);
        setState("error");
        return;
      }

      console.log("Inserted invoice:", doc);

      setState("done");
      setProgress("Invoice processed successfully!");
      setFile(null);
    } catch (err: any) {
      console.error(err);
      setError("Unexpected error: " + err.message);
      setState("error");
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Upload Invoice</h2>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <input type="file" onChange={onFileChange} accept="application/pdf,image/*" />

      <button
        onClick={processInvoice}
        className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
      >
        Process Invoice
      </button>

      {state !== "idle" && (
        <div className="mt-4 p-3 bg-gray-100 rounded">
          <p>Status: {state}</p>
          <p>{progress}</p>
        </div>
      )}
    </div>
  );
}
