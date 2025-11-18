// src/TestInvoiceUpload.tsx

import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { processInvoiceUpload } from "./lib/processInvoiceUpload";

// ⚠️ If you already have a supabase client in src/lib/supabase.ts, use that instead.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function TestInvoiceUpload() {
  const [invoiceText, setInvoiceText] = useState("");
  const [orgId, setOrgId] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function handleTestUpload() {
    setStatus("Saving...");

    try {
      if (!orgId) {
        setStatus("Please enter an orgId (existing organization id from Supabase).");
        return;
      }
      if (!invoiceText.trim()) {
        setStatus("Please paste some invoice text first.");
        return;
      }

      // For now we hard-code a couple of example lines.
      // Later you will replace this with real parsed lines from the PDF.
      const exampleLines = [
        {
          description: "Diesel fuel 100 liter",
          quantity: 100,
          unitRaw: "l",
          amountNok: 2500,
        },
        {
          description: "Frozen fries 50 stk",
          quantity: 50,
          unitRaw: "stk",
          amountNok: 1500,
        },
        {
          description: "Office laptop",
          quantity: 1,
          unitRaw: "stk",
          amountNok: 12000,
        },
      ];

      const result = await processInvoiceUpload({
        supabase,
        orgId,
        invoiceText,
        lines: exampleLines,
      });

      setStatus(`Done! Created document_id=${result.documentId}`);
    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message ?? "unknown error"}`);
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: "2rem auto", padding: "1rem" }}>
      <h1>Test Invoice Upload with CO2</h1>

      <label style={{ display: "block", marginBottom: "0.5rem" }}>
        Org ID (from organizations table):
        <input
          type="text"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          style={{ width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        />
      </label>

      <label style={{ display: "block", marginBottom: "0.5rem" }}>
        Invoice text (paste OCR text here):
        <textarea
          value={invoiceText}
          onChange={(e) => setInvoiceText(e.target.value)}
          rows={10}
          style={{ width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
        />
      </label>

      <button onClick={handleTestUpload} style={{ padding: "0.5rem 1rem" }}>
        Save test invoice + lines with CO2
      </button>

      {status && <p style={{ marginTop: "1rem" }}>{status}</p>}
    </div>
  );
}
