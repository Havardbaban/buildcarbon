// src/components/DownloadCarbonReportButton.tsx
import React, { useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import { calculateEsgEScore } from "../lib/emissions";

export default function DownloadCarbonReportButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select(
        "invoice_date, vendor, amount_nok, total_co2_kg, scope, category"
      )
      .eq("org_id", ACTIVE_ORG_ID);

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const rows = data ?? [];

    const totalCo2 = rows.reduce(
      (s, r) => s + (r.total_co2_kg ?? 0),
      0
    );
    const totalSpend = rows.reduce(
      (s, r) => s + (r.amount_nok ?? 0),
      0
    );
    const esgScore = calculateEsgEScore(totalCo2, totalSpend);

    const doc = new jsPDF();
    let y = 15;

    doc.setFontSize(16);
    doc.text("Carbon Report", 14, y);
    y += 8;

    doc.setFontSize(10);
    doc.text(`Total CO₂: ${totalCo2.toFixed(1)} kg`, 14, y);
    y += 5;
    doc.text(`Total spend: ${totalSpend.toFixed(0)} NOK`, 14, y);
    y += 5;
    doc.text(`ESG E-score: ${esgScore}/100`, 14, y);
    y += 10;

    doc.text("Top invoices by CO₂:", 14, y);
    y += 5;

    const sorted = [...rows].sort(
      (a, b) => (b.total_co2_kg ?? 0) - (a.total_co2_kg ?? 0)
    );

    for (const row of sorted.slice(0, 20)) {
      if (y > 280) {
        doc.addPage();
        y = 15;
      }
      const line = `${row.invoice_date ?? "-"} | ${
        row.vendor ?? "-"
      } | ${(row.total_co2_kg ?? 0).toFixed(1)} kg | ${
        row.amount_nok ?? 0
      } NOK | ${row.scope ?? ""}`;
      doc.text(line, 14, y);
      y += 5;
    }

    doc.save("carbon-report.pdf");
    setLoading(false);
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
    >
      {loading ? "Generating report…" : "Download carbon report (PDF)"}
    </button>
  );
}
