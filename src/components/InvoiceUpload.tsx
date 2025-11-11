import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import Tesseract from "tesseract.js";
import { supabase } from "../lib/supabase";
import { pdfToPngBlobs } from "../lib/pdfToImages";
import { parseInvoiceText } from "../lib/invoiceParser.ts";

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

      setProgress("Uploading to storage...");
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
      const row = insertRows[0];

      // Get a public/signed URL for preview
      let public_url: string | null = null;
      const pub = supabase.storage.from("invoices").getPublicUrl(storage_path);
      public_url = pub?.data?.publicUrl ?? null;

      // OCR if PDF
      setProgress("Extracting text...");
      let text = "";

      if (ext === "pdf") {
        const blobs = await pdfToPngBlobs(file);
        for (const blob of blobs) {
          const { data } = await Tesseract.recognize(blob, "eng");
          text += data.text + "\n";
        }
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const decoded = new TextDecoder().decode(arrayBuffer);
        text = decoded;
      }

      const parsed = parseInvoiceText(text);

      // Update invoice with parsed data
      setProgress("Saving extracted data...");
      const { error: updErr } = await supabase
        .from("invoices")
        .update({
          vendor: parsed.vendor,
          date: parsed.dateISO,
          total: parsed.total,
          status: "done",
        })
        .eq("id", row.id);

      if (updErr) throw updErr;

      setProgress("Complete!");
      setBusy(false);
      if (onFinished) onFinished();
    } catch (e: any) {
      console.error(e);
      setErr(e.message ?? String(e));
      setBusy(false);
    }
  };

  return (
    <div className="border p-4 rounded-xl bg-white shadow-sm">
      <h2 className="font-semibold mb-2">Upload Invoice</h2>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.txt"
        disabled={busy}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {progress && <p className="text-sm text-gray-600 mt-2">{progress}</p>}
      {err && <p className="text-sm text-red-500 mt-2">{err}</p>}
    </div>
  );
}
