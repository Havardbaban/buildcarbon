import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import Tesseract from "tesseract.js";

import { supabase } from "../lib/supabase";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import parseInvoice from "../lib/invoiceParser";
import estimateEmissions from "../lib/estimateEmissions";

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

    // PDFs -> render pages to PNG blobs and OCR page-by-page
    if (file.type === "application/pdf") {
      const pages = await pdfToPngBlobs(file);
      let combined = "";
      for (let i = 0; i < pages.length; i++) {
        setProgress(`Reading page ${i + 1} of ${pages.length}...`);
        combined += "\n" + (await ocrBlob(pages[i]));
      }
      return combined.trim();
    }

    // Images (png/jpg/webp)
    if (file.type.startsWith("image/")) {
      setProgress("Reading image...");
      return await ocrBlob(file);
    }

    // Fallback
    try {
      return await file.text();
    } catch {
      throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setBusy(true);
    setErr(null);
    setProgress("Starting...");

    try {
      const file = files[0];
      const rowId = uuidv4();

      // 1) Create placeholder row
      setProgress("Creating invoice record...");
      const { error: insErr } = await supabase.from("invoices").insert({
        id: rowId,
        filename: file.name,
        status: "processing",
      });
      if (insErr) throw insErr;

      // 2) OCR
      setProgress("Extracting text...");
      const text = await extractTextFromFile(file);

      // 3) Parse structured fields
      setProgress("Parsing fields...");
      const parsed = await parseInvoice(text);

      // 3.5) Estimate emissions (kWh/liters/m³ or direct CO₂)
      const est = estimateEmissions({ text, parsed });

      // ensure activity values are carried over if estimator didn’t echo them
      if (parsed.energyKwh != null && est.energy_kwh == null) est.energy_kwh = parsed.energyKwh;
      if (parsed.fuelLiters != null && est.fuel_liters == null) est.fuel_liters = parsed.fuelLiters;
      if (parsed.gasM3 != null && est.gas_m3 == null) est.gas_m3 = parsed.gasM3;

      // 4) Update the row with parsed + estimated data
      setProgress("Saving data...");
      const updatePayload: Record<string, any> = {
        vendor: parsed.vendor ?? null,
        invoice_number: parsed.invoiceNumber ?? null,
        date: parsed.dateISO ?? null,
        total: parsed.total ?? null,
        currency: parsed.currency ?? null,
        raw_text: text,
        status: "parsed",
        co2_kg: est.co2_kg ?? parsed.co2Kg ?? null,
        energy_kwh: est.energy_kwh ?? null,
        fuel_liters: est.fuel_liters ?? null,
        gas_m3: est.gas_m3 ?? null,
      };
      if (parsed.orgNumber) updatePayload.org_number = parsed.orgNumber;

      const { error: updErr } = await supabase
        .from("invoices")
        .update(updatePayload)
        .eq("id", rowId);
      if (updErr) throw updErr;

      setProgress("Complete!");
      setBusy(false);
      if (onFinished) onFinished();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? "Unexpected error");
      setBusy(false);
    }
  }

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

