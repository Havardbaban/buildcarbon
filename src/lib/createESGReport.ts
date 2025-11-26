// src/lib/createESGReport.ts

// Enkel type for leverandør-oppsummering i rapporten
export type SupplierBreakdown = {
  name: string;
  co2: number;
  cost: number;
};

export type ESGReportInput = {
  orgName: string;
  periodLabel: string;
  generatedAt: Date;
  totalCo2: number;
  totalCost: number;
  invoiceCount: number;
  suppliers: SupplierBreakdown[];
};

// @ts-ignore – html2pdf har ikke offisielle typer
import html2pdf from "html2pdf.js";

export function createESGReport(input: ESGReportInput) {
  if (typeof window === "undefined") return;

  const {
    orgName,
    periodLabel,
    generatedAt,
    totalCo2,
    totalCost,
    invoiceCount,
    suppliers,
  } = input;

  // Lag et midlertidig DOM-element
  const container = document.createElement("div");
  container.style.padding = "24px";
  container.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  container.style.fontSize = "12px";
  container.style.color = "#111827";

  const generatedStr = generatedAt.toLocaleString("nb-NO");

  const suppliersRows =
    suppliers.length === 0
      ? `<tr><td colspan="3" style="padding:8px;border-top:1px solid #e5e7eb;text-align:center;color:#6b7280;">Ingen data tilgjengelig</td></tr>`
      : suppliers
          .map(
            (s) => `
        <tr>
          <td style="padding:8px;border-top:1px solid #e5e7eb;">${s.name}</td>
          <td style="padding:8px;border-top:1px solid #e5e7eb;text-align:right;">${s.cost.toLocaleString(
            "nb-NO",
            { maximumFractionDigits: 0 }
          )} kr</td>
          <td style="padding:8px;border-top:1px solid #e5e7eb;text-align:right;">${s.co2.toFixed(
            1
          )} kg</td>
        </tr>`
          )
          .join("");

  container.innerHTML = `
    <h1 style="font-size:20px;font-weight:700;margin-bottom:4px;">ESG- og klimarapport</h1>
    <div style="font-size:12px;color:#4b5563;margin-bottom:16px;">
      Organisasjon: <strong>${orgName}</strong><br />
      Periode: <strong>${periodLabel}</strong><br />
      Generert: ${generatedStr}
    </div>

    <h2 style="font-size:14px;font-weight:600;margin-bottom:8px;">1. Sammendrag</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tbody>
        <tr>
          <td style="padding:6px 4px;color:#6b7280;">Total CO₂</td>
          <td style="padding:6px 4px;text-align:right;font-weight:600;">${totalCo2.toFixed(
            1
          )} kg</td>
        </tr>
        <tr>
          <td style="padding:6px 4px;color:#6b7280;">Totale kostnader (fra fakturaer)</td>
          <td style="padding:6px 4px;text-align:right;font-weight:600;">${totalCost.toLocaleString(
            "nb-NO",
            {
              maximumFractionDigits: 0,
            }
          )} kr</td>
        </tr>
        <tr>
          <td style="padding:6px 4px;color:#6b7280;">Antall fakturaer</td>
          <td style="padding:6px 4px;text-align:right;font-weight:600;">${invoiceCount}</td>
        </tr>
      </tbody>
    </table>

    <h2 style="font-size:14px;font-weight:600;margin-bottom:8px;">2. Leverandører med størst fotavtrykk</h2>
    <p style="font-size:11px;color:#6b7280;margin-bottom:8px;">
      Basert på fakturaene som er lastet opp i systemet. Summene kan brukes som grunnlag for
      dialog med leverandører og prioritering av tiltak.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Leverandør</th>
          <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Kostnad (kr)</th>
          <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;">CO₂ (kg)</th>
        </tr>
      </thead>
      <tbody>
        ${suppliersRows}
      </tbody>
    </table>

    <h2 style="font-size:14px;font-weight:600;margin-bottom:8px;">3. Kommentar og bruk</h2>
    <p style="font-size:11px;color:#4b5563;line-height:1.5;">
      Denne rapporten er generert direkte fra leverandørfakturaer. Tallene kan brukes som
      dokumentasjon overfor banker, tilskuddsordninger, styret eller andre interessenter.
      For mer detaljert underlag kan tilhørende PDF-fakturaer lastes ned fra
      dokumentseksjonen i løsningen.
    </p>
  `;

  document.body.appendChild(container);

  const opt = {
    margin: 10,
    filename: `ESG-rapport-${orgName.replace(/\s+/g, "_")}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
  };

  // @ts-ignore
  html2pdf()
    .set(opt)
    .from(container)
    .save()
    .finally(() => {
      document.body.removeChild(container);
    });
}
