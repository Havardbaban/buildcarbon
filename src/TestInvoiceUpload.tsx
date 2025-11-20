import React, { useState } from "react";
import processInvoiceUpload from "./lib/processInvoiceUpload";
import supabase from "./lib/supabase";

export default function TestInvoiceUpload() {
  const [orgId, setOrgId] = useState("");
  const [invoiceText, setInvoiceText] = useState("");
  const [status, setStatus] = useState("");

  const onSubmit = async () => {
    setStatus("Processing...");
    try {
      const result = await processInvoiceUpload({
        supabase,
        orgId,
        invoiceText,
        lines: [], // for now no separate line system
      });

      console.log("Invoice upload result:", result);
      setStatus("Success! Saved invoice + CO2.");
    } catch (err: any) {
      console.error("Full error object:", err);

      // Try to show full JSON if possible
      let msg = "";
      try {
        msg = JSON.stringify(err, null, 2);
      } catch {
        msg = err?.message ?? "Unknown error";
      }

      setStatus("Error:\n" + msg);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 20 }}>
      <h2>Test Invoice Upload with CO2</h2>

      <label>Org ID (from organizations table):</label>
      <div>
        <input
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 20 }}
        />
      </div>

      <label>Invoice text (paste OCR text here):</label>
      <div>
        <textarea
          value={invoiceText}
          onChange={(e) => setInvoiceText(e.target.value)}
          style={{ width: "100%", height: 200, padding: 8, marginBottom: 20 }}
        />
      </div>

      <button
        onClick={onSubmit}
        style={{
          padding: "10px 20px",
          fontSize: 16,
          cursor: "pointer",
          border: "1px solid black",
          background: "white",
        }}
      >
        Save test invoice + lines with CO2
      </button>

      <pre
        style={{
          whiteSpace: "pre-wrap",
          background: "#f5f5f5",
          padding: 20,
          marginTop: 20,
        }}
      >
        {status}
      </pre>
    </div>
  );
}
