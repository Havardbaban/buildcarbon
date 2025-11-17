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

/* ---------- Helpers ---------- */

/** Normalize money-looking strings into a number.
 * Handles NO formats like `9.969,00`, plain `9969`, `9 969,00`, etc. */
function normalizeAmount(input?: string | number | null): number | null {
  if (input == null) return null;
  if (typeof input === "number" && isFinite(input)) return input;

  let s = String(input).trim();
  if (!s) return null;

  // Keep digits, comma, dot, space
  s = s.replace(/[^\d.,\s]/g, "");

  // If both separators exist, assume the rightmost is decimal
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    const decIsComma = lastComma > lastDot;
    if (decIsComma) {
      s = s.replace(/\./g, ""); // dots as thousands
      s = s.replace(",", ".");  // comma as decimal
    } else {
      s = s.replace(/,/g, ""); // commas as thousands
      // dot remains decimal
    }
  } else if (lastComma !== -1 && lastDot === -1) {
    // Only comma present -> treat as decimal
    s = s.replace(/\s/g, "");
    s = s.replace(/\./g, "");
    s = s.replace(",", ".");
  } else if (lastDot !== -1 && lastComma === -1) {
    // Only dot present -> assume dot decimal, remove spaces
    s = s.replace(/\s/g, "");
  } else {
    // No decimal separators -> just remove spaces
    s = s.replace(/\s/g, "");
  }

  const n = Number(s);
  if (!isFinite(n)) return null;
  // Snap very small decimals that are likely OCR fuzz
  return Math.abs(n) < 0.005 ? 0 : n;
}

/** As a fallback, try to pull a total from the raw text
 * by scanning for a money-like pattern next to words like
 * "sum", "total", "beløp". */
function fallbackScanTotal(text: string): number | null {
  const lower = text.toLowerCase();
  const lines = lower.split(/\r?\n/);

  const money = /(\d[\d\s.\,]{0,20}\d)(?:\s*(?:nok|kr))?/i;
  const hints = /(sum|total|bel[øo]p|inkl\.? mva|amount)/i;

  // look for a hint in the same line and capture the number on that line
  for (const line of lines) {
    if (!hints.test(line)) continue;
    const m = line.match(money);
    if (m && m[1]) {
      const val = normalizeAmount(m[1]);
      if (val != null && val > 0) return val;
    }
  }

  // Otherwise take the largest money-like number in the whole text
  const all = [...text.matchAll(money)]
    .map((m) => normalizeAmount(m[1] ?? ""))
    .filter((n): n is number => n != null && isFinite(n) && n > 0);
  if (all.length) {
    return all.sort((a, b) => b - a)[0];
  }
  return null;
}

/* ---------- OCR helpers ---------- */

async function ocrBlob(blob: Blob): Promise<string> {
  const { data } = await Tesseract.recognize(blob, "eng");
  return data.text ?? "";
}

async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === "text/plain") {
    return await file.text();
  }

  if (file.type === "application/pdf") {
    const pages = await pdfToPngBlobs(file);
    let combined = "";
    for (let i = 0; i < pages.length; i++) {
      combined += "\n" + (await ocrBlob(pages[i]));
    }
    return combined.trim();
  }

  if (file.type.startsWith("image/")) {
    return await ocrBlob(file);
  }

  // Fallback – try to read as text
  try {
    return await file.text();
  } catch {
    throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
  }
}

/* ---------- Component ---------- */

export default function InvoiceUpload({ onFinished }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setBusy(true);
    setErr(null);
    setProgress("Starting…");

    try {
      const file = files[0];
      const rowId = uuidv4();

      // 1) Insert placeholder row (enum-safe status)
      setProgress("Creating invoice record…");
      const { error: insErr } = await supabase.from("invoices").insert({
        id: rowId,
        filename: file.name,
        status: "processing", // allowed enum
      });
      if (insErr) throw insErr;

      // 2) OCR / extract text
      setProgress("Extracting text…");
      const text = await extractTextFromFile(file);

      // 3) Parse fields
      setProgress("Parsing fields…");
      const parsed = await parseInvoice(text);

      // 3a) Normalize & fallback for total
      let total = normalizeAmount((parsed as any).totalRaw ?? parsed.total);
      if (total == null || total <= 0) {
        const scanned = fallbackScanTotal(text);
        if (scanned != null && scanned > 0) total = scanned;
      }

      // 3b) Currency fallback
      const currency =
        parsed.currency ??
        (/\bNOK\b|\bKR\b|kr\b/i.test(text) ? "NOK" : null);

      // 4) Emissions estimation
      setProgress("Estimating emissions…");
      const est = estimateEmissions({ text, parsed, total, currency });

      // 5) Update DB row with parsed + emissions
      setProgress("Saving data…");
      const payload: Record<string, any> = {
        vendor: parsed.vendor ?? null,
        invoice_number: parsed.invoiceNumber ?? null,
        date: parsed.dateISO ?? null,
        total: total ?? null,
        currency: currency ?? null,
        raw_text: text,
        status: "parsed", // enum-safe
        // emissions & activity
        co2_kg: est.co2_kg ?? null,
        energy_kwh: est.energy_kwh ?? null,
        fuel_liters: est.fuel_liters ?? null,
        gas_m3: est.gas_m3 ?? null,
      };

      // include org number if parser found it
      if ((parsed as any).orgNumber) {
        payload.org_number = (parsed as any).orgNumber;
      }

      const { error: updErr } = await supabase
        .from("invoices")
        .update(payload)
        .eq("id", rowId);

      if (updErr) throw updErr;

      setProgress("Complete!");
      setBusy(false);
      onFinished?.();
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? "Unexpected error");
      setBusy(false);
      // Best-effort: flag the newest row as failed if we can’t complete
      try {
        await supabase
          .from("invoices")
          .update({ status: "failed" })
          .order("created_at", { ascending: false })
          .limit(1);
      } catch {}
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
