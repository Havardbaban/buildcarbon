import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import Tesseract from "tesseract.js";
import { supabase } from "../lib/supabase";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import { parseInvoiceText } from "../lib/invoiceParser";

type Props = {
  onFinished?: () => void;
};

export default function InvoiceUpload({ onFinished }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setErr(null);
    setBusy(true);

    try {
      const file = files[0];
      const id = uuidv4();
      const ext = file.name.split(".").pop() || "dat";
      const path = `invoices/${id}.${ext}`; // stored at bucket root

      setProgress("Uploading to storage…");
      const { data: upload, error: upErr } = await supabase.storage
        .from("invoices")
        .upload(path, file, { upsert: true });

      if (upErr) throw upErr;

      // Insert DB row
      const filename = file.name;
      const storage_path = upload?.path ?? path;
      const { data: insertRows, error: insErr } = await supabase
        .from("invoices")
        .insert({ filename, storage_path, status: "processing" })
        .select();

      if (insErr) throw insErr;
      const row = insertRows![0];

      // Get a public/signed URL for preview
      let public_url: string | null = null;
      const pub = supabase.storage.from("invoices").getPublicUrl(storage_path);
      public_url = pub?.data?.publicUrl ?? null;

      // OCR
      setProgress("Running OCR…");
      const images: Blob[] =
        file.type === "application/pdf" ? await pdfToPngBlobs(file) : [file];

      let fullText = "";
      for (let i = 0; i < images.length; i++) {
        setProgress(`OCR page ${i + 1}/${images.length}…`);
        const img = images[i];
        const { data } = await Tesseract.recognize(img, "eng+nor", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(`OCR page ${i + 1}/${images.length}: ${Math.round(m.progress * 100)}%`);
            }
          },
        });
        fullText += "\n" + data.text;
      }

      // Parse
      const parsed = parseInvoiceText(fullText);
      // VERY simple CO₂ estimate placeholder: 0.06 kg per NOK 1 spent (adjust later)
      const co2_kg =
        parsed.total && Number.isFinite(parsed.total) ? Math.round(parsed.total * 0.06) : null;

      // Update row
      setProgress("Saving parsed data…");
      const { error: upError } = await supabase
        .from("invoices")
        .update({
          status: "parsed",
          ocr_text: fullText,
          vendor: parsed.vendor ?? null,
          invoice_date: parsed.dateISO ?? null,
          total_amount: parsed.total ?? null,
          public_url,
          co2_kg,
        })
        .eq("id", row.id);

      if (upError) throw upError;

      setProgress("Done!");
      onFinished?.();
    } catch (e: any) {
      console.error(e);
      setErr(e.message ?? "Upload failed");
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border rounded-2xl p-4">
      <p className="font-medium mb-2">Upload invoice (PDF/JPG/PNG)</p>
      <input
        type="file"
        accept="application/pdf,image/*"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={busy}
      />
      {progress && <p className="text-sm mt-2">{progress}</p>}
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      <p className="text-xs text-gray-500 mt-2">
        OCR runs in the browser. First page(s) of PDFs are rendered to images for scanning.
      </p>
    </div>
  );
}
