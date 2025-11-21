// src/pages/Invoices.tsx

import React, {
  useEffect,
  useState,
  ChangeEvent,
  FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../lib/supabase";

type DocumentRow = {
  id: string;
  org_id: string;
  issue_date: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
  fuel_liters: number | null;
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  try {
    const d = new Date(value);
    return d.toLocaleDateString("nb-NO");
  } catch {
    return value;
  }
}

export default function InvoicesPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);

  // upload + scan state
  const [orgId, setOrgId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  // -------- load existing documents --------

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("document")
      .select("*")
      .order("issue_date", { ascending: false });

    if (error) {
      console.error("Error loading documents:", error);
      setError(error.message ?? "Unknown error");
      setDocs([]);
    } else {
      setDocs((data || []) as DocumentRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  // -------- upload + scan handlers --------

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!orgId || !selectedFile) {
      setUploadStatus("Please enter org ID and choose a PDF file.");
      return;
    }

    try {
      setUploadStatus("Uploading and scanning...");

      // 1) Upload file to Supabase Storage bucket "invoices"
      const filePath = `${orgId}/${Date.now()}-${selectedFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(filePath, selectedFile);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        setUploadStatus("Upload failed: " + uploadError.message);
        return;
      }

      // 2) Call API to process invoice (extract text + save + CO2)
            const res = await fetch("/api/process-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, filePath }),
      });

      // Read raw text so we can see HTML / error pages too
      const text = await res.text();

      if (!res.ok) {
        console.error("API error:", res.status, res.statusText, text);
        setUploadStatus(
          `Processing failed: status ${res.status} ${res.statusText}\n${text}`
        );
        return;
      }

      // Try to parse JSON if it is JSON
      let body: any = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = {};
      }


      setUploadStatus("Success! Invoice scanned and saved.");
      setSelectedFile(null);

      // 3) Refresh table
      await loadDocuments();
    } catch (err: any) {
      console.error("Unexpected upload error:", err);
      setUploadStatus(
        "Unexpected error: " + (err?.message ?? String(err))
      );
    }
  };

  // -------- render --------

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <button
        onClick={() => navigate("/")}
        style={{ marginBottom: 16, padding: "4px 12px" }}
      >
        ← Back
      </button>

      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Invoices</h1>

      {/* Upload & scan form */}
      <form onSubmit={handleUpload} style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 8 }}>
          <label>
            Org ID:&nbsp;
            <input
              type="text"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              style={{ padding: 6, width: 220 }}
              placeholder="e.g. 123456789"
            />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>
            Invoice PDF:&nbsp;
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
            />
          </label>
        </div>

        <button type="submit" style={{ padding: "6px 16px" }}>
          Upload &amp; Scan
        </button>

        {uploadStatus && (
          <pre
            style={{
              marginTop: 8,
              fontSize: 14,
              whiteSpace: "pre-wrap",
            }}
          >
            {uploadStatus}
          </pre>
        )}
      </form>

      {error && (
        <div style={{ color: "red", marginBottom: 12 }}>
          Error: {error}
        </div>
      )}

      {loading ? (
        <div>Loading invoices...</div>
      ) : docs.length === 0 ? (
        <div>No invoices yet.</div>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #ddd",
                  padding: 8,
                }}
              >
                Issue date
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #ddd",
                  padding: 8,
                }}
              >
                Org ID
              </th>
              <th
                style={{
                  textAlign: "right",
                  borderBottom: "1px solid #ddd",
                  padding: 8,
                }}
              >
                Total amount
              </th>
              <th
                style={{
                  textAlign: "right",
                  borderBottom: "1px solid #ddd",
                  padding: 8,
                }}
              >
                CO₂ (kg)
              </th>
              <th
                style={{
                  textAlign: "right",
                  borderBottom: "1px solid #ddd",
                  padding: 8,
                }}
              >
                Fuel (liters)
              </th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id}>
                <td
                  style={{
                    padding: 8,
                    borderBottom: "1px solid #eee",
                  }}
                >
                  {formatDate(doc.issue_date)}
                </td>
                <td
                  style={{
                    padding: 8,
                    borderBottom: "1px solid #eee",
                  }}
                >
                  {doc.org_id}
                </td>
                <td
                  style={{
                    padding: 8,
                    borderBottom: "1px solid #eee",
                    textAlign: "right",
                  }}
                >
                  {formatNumber(doc.total_amount)}{" "}
                  {doc.currency || ""}
                </td>
                <td
                  style={{
                    padding: 8,
                    borderBottom: "1px solid #eee",
                    textAlign: "right",
                  }}
                >
                  {formatNumber(doc.co2_kg)}
                </td>
                <td
                  style={{
                    padding: 8,
                    borderBottom: "1px solid #eee",
                    textAlign: "right",
                  }}
                >
                  {formatNumber(doc.fuel_liters)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
