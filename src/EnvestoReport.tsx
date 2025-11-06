// FILE: src/EnvestoReport.tsx
// Bank/insurance/tax-ready sustainability ROI report with PDF export.
// Vite + React + TypeScript. Uses html2pdf.js. Exposes ref.generate().

import React, {
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
// @ts-ignore – html2pdf has no default TS types
import html2pdf from "html2pdf.js";

// —— Envesto brand tokens ——
const BRAND = {
  name: "Envesto",
  primary: "#0E9F6E", // emerald-600
  primaryDark: "#047857", // emerald-700
  ink: "#0F172A", // slate-900
  subtle: "#475569", // slate-600
  border: "#E2E8F0", // slate-200
};

// —— Helper formatters ——
function currency(n?: number, currencyCode = "NOK") {
  if (!Number.isFinite(n as number)) return "–";
  return new Intl.NumberFormat("no-NO", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(n as number);
}
function pct(n?: number, digits = 1) {
  if (!Number.isFinite(n as number)) return "–";
  return `${(n as number).toFixed(digits)}%`;
}

// —— Finance assumptions ——
const ASSUMPTIONS = {
  analysisYears: 7,
  discountRate: 0.08,
  loanYears: 5,
  depreciationYears: 5,
  energyPriceNOKperKWh: 1.2,
  gridEmissionFactorKgPerKWh: 0.17,
};

// —— Math helpers ——
function npv(rate: number, cash: number[]) {
  return cash.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}
function irr(cash: number[], guess = 0.1) {
  let r = guess;
  for (let i = 0; i < 100; i++) {
    let f = 0,
      df = 0;
    for (let t = 0; t < cash.length; t++) {
      const c = cash[t];
      f += c / Math.pow(1 + r, t);
      if (t > 0) df += (-t * c) / Math.pow(1 + r, t + 1);
    }
    const step = f / df;
    r -= step;
    if (Math.abs(step) < 1e-7) break;
  }
  return r;
}
function annuityPayment(principal: number, annualRate: number, years: number) {
  const r = annualRate;
  const n = years;
  if (r === 0) return principal / n;
  return (principal * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
}
function buildAmortization(principal: number, annualRate: number, years: number) {
  const payment = annuityPayment(principal, annualRate, years);
  const rows: {
    year: number;
    opening: number;
    interest: number;
    principalPaid: number;
    payment: number;
    closing: number;
  }[] = [];
  let balance = principal;
  for (let y = 1; y <= years; y++) {
    const interest = balance * annualRate;
    const principalPaid = Math.min(payment - interest, balance);
    const closing = Math.max(0, balance - principalPaid);
    rows.push({ year: y, opening: balance, interest, principalPaid, payment, closing });
    balance = closing;
  }
  return { payment, rows };
}

// —— Input type ——
export type EnvestoInputs = {
  energySpend: number; // NOK/year baseline
  reductionPct: number; // %
  grant: number; // NOK one-off
  loanAmount: number; // NOK
  rateCurrent: number; // % (info only)
  rateGreen: number; // %
  capex: number; // NOK
  taxRate: number; // %
  consultantFees: number; // NOK one-off
};

type Props = {
  inputs: EnvestoInputs;
  companyName?: string;
  projectTitle?: string;
  currencyCode?: string;
  /** Hide/show the internal “Generate PDF” button. Default: true */
  showButton?: boolean;
};

// —— Component (exposes ref.generate()) ——
const EnvestoReport = forwardRef(function EnvestoReport(
  {
    inputs,
    companyName = "Client Company",
    projectTitle = "Energy Efficiency Investment",
    currencyCode = "NOK",
    showButton = true,
  }: Props,
  ref: React.Ref<{ generate: () => Promise<void> }>
) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const model = useMemo(() => {
    const taxRate = inputs.taxRate / 100;
    const savingsGross = inputs.energySpend * (inputs.reductionPct / 100);
    const savingsAfterTax = savingsGross * (1 - taxRate);

    const depreciation = (inputs.capex + inputs.consultantFees) / ASSUMPTIONS.depreciationYears;
    const taxShield = depreciation * taxRate;

    const upfront = inputs.capex + inputs.consultantFees - inputs.grant;

    const { payment: annualDebtService, rows: amort } = buildAmortization(
      inputs.loanAmount,
      inputs.rateGreen / 100,
      ASSUMPTIONS.loanYears
    );

    // Unlevered CF
    const ocf: number[] = [-upfront];
    for (let y = 1; y <= ASSUMPTIONS.analysisYears; y++) {
      ocf.push(savingsAfterTax + taxShield);
    }
    const npvUnlevered = npv(ASSUMPTIONS.discountRate, ocf);
    const irrUnlevered = irr(ocf);

    // Levered CF
    const lcf: number[] = [-upfront];
    for (let y = 1; y <= ASSUMPTIONS.analysisYears; y++) {
      const ds = y <= ASSUMPTIONS.loanYears ? annualDebtService : 0;
      lcf.push(savingsAfterTax + taxShield - ds);
    }
    const npvLevered = npv(ASSUMPTIONS.discountRate, lcf);
    const irrLevered = irr(lcf);

    // Payback (simple, levered)
    let cum = -upfront;
    let paybackYears: number | null = null;
    for (let y = 1; y < lcf.length; y++) {
      cum += lcf[y];
      if (cum >= 0 && paybackYears === null) paybackYears = y;
    }

    // DSCR
    const dscr = amort.map((r) => {
      const noi = savingsAfterTax + taxShield;
      return { year: r.year, dscr: noi / r.payment, debtService: r.payment };
    });

    // Environmental
    const baselineKWh = inputs.energySpend / ASSUMPTIONS.energyPriceNOKperKWh;
    const savedKWh = baselineKWh * (inputs.reductionPct / 100);
    const co2SavedKg = savedKWh * ASSUMPTIONS.gridEmissionFactorKgPerKWh;

    return {
      savingsGross,
      savingsAfterTax,
      depreciation,
      taxShield,
      upfront,
      annualDebtService,
      amort,
      ocf,
      lcf,
      npvUnlevered,
      irrUnlevered,
      npvLevered,
      irrLevered,
      paybackYears,
      dscr,
      baselineKWh,
      savedKWh,
      co2SavedKg,
    };
  }, [inputs]);

  const generatePDF = async () => {
    const el = wrapRef.current;
    if (!el) return;
    const opt = {
      margin: [10, 12, 10, 12],
      filename: `${BRAND.name}-${projectTitle.replace(/\s+/g, "_")}-Report.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    } as any;
    await html2pdf().from(el).set(opt).save();
  };

  // Expose .generate() to parent
  useImperativeHandle(ref, () => ({ generate: generatePDF }), []);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
          Bank-Ready Investment Report
        </h1>
        {showButton && (
          <button
            onClick={generatePDF}
            className="px-4 py-2 rounded-xl text-white"
            style={{ background: BRAND.primary }}
          >
            Generate PDF
          </button>
        )}
      </div>

      {/* PDF wrapper (A4 width) */}
      <div
        ref={wrapRef}
        className="bg-white shadow rounded-2xl px-10 py-12 mx-auto"
        style={{ width: "210mm", maxWidth: "210mm" }}
      >
        {/* ——— Cover Page ——— */}
        <section className="min-h-[260mm] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="text-4xl font-bold" style={{ color: BRAND.primary }}>
                {BRAND.name}
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500">Prepared for</div>
                <div className="text-lg font-semibold" style={{ color: BRAND.ink }}>
                  {companyName}
                </div>
              </div>
            </div>

            <h2 className="mt-16 text-3xl font-semibold" style={{ color: BRAND.ink }}>
              {projectTitle}
            </h2>
            <p className="mt-3 text-slate-600 max-w-prose">
              A financial-grade assessment of investment value, risk, compliance, and environmental
              impact prepared by {BRAND.name}.
            </p>

            <div className="mt-10 grid grid-cols-3 gap-4 text-sm">
              <Stat label="Upfront Investment (net)" value={currency(model.upfront, currencyCode)} />
              <Stat label="Annual Savings (after tax)" value={currency(model.savingsAfterTax, currencyCode)} />
              <Stat label="Debt Service (annual)" value={currency(model.annualDebtService, currencyCode)} />
            </div>

            <div className="mt-10 grid grid-cols-2 gap-4 text-sm">
              <Stat label={`Unlevered NPV @ ${pct(ASSUMPTIONS.discountRate * 100)}`} value={currency(model.npvUnlevered, currencyCode)} />
              <Stat label="Unlevered IRR" value={pct(model.irrUnlevered * 100, 1)} />
              <Stat label={`Levered NPV @ ${pct(ASSUMPTIONS.discountRate * 100)}`} value={currency(model.npvLevered, currencyCode)} />
              <Stat label="Levered IRR" value={pct(model.irrLevered * 100, 1)} />
            </div>
          </div>

          <div className="text-sm text-slate-500">
            <div className="border-t mt-12 pt-4" style={{ borderColor: BRAND.border }}>
              Confidential – Prepared by {BRAND.name}
            </div>
          </div>
        </section>

        <div className="break-before-page" />

        {/* ——— Executive Summary ——— */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            Executive Summary
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm leading-relaxed">
            <div>
              <p>
                <span className="font-semibold">Objective:</span> Reduce energy spend by{" "}
                {pct(inputs.reductionPct)} through targeted efficiency measures, financed via a green loan.
              </p>
              <p className="mt-3">
                <span className="font-semibold">Financial outcome (levered):</span> NPV{" "}
                {currency(model.npvLevered, currencyCode)}, IRR {pct(model.irrLevered * 100)} with a simple
                payback of {model.paybackYears ?? "–"} years.
              </p>
              <p className="mt-3">
                <span className="font-semibold">Compliance & Risk:</span> Structured for bank underwriting,
                insurance risk controls, and tax documentation with explicit assumptions and schedules.
              </p>
            </div>
            <div>
              <div
                className="rounded-xl border p-4"
                style={{ borderColor: BRAND.border, background: "#F8FAFC" }}
              >
                <div className="text-slate-500">Key Metrics</div>
                <ul className="mt-2 space-y-1">
                  <li>
                    Annual after-tax savings:{" "}
                    <span className="font-semibold">{currency(model.savingsAfterTax, currencyCode)}</span>
                  </li>
                  <li>
                    Annual debt service (years 1–{ASSUMPTIONS.loanYears}):{" "}
                    <span className="font-semibold">{currency(model.annualDebtService, currencyCode)}</span>
                  </li>
                  <li>
                    DSCR (year 1):{" "}
                    <span className="font-semibold">
                      {model.dscr[0] ? model.dscr[0].dscr.toFixed(2) : "–"}
                    </span>
                  </li>
                  <li>
                    Analysis horizon: <span className="font-semibold">{ASSUMPTIONS.analysisYears} years</span>
                  </li>
                  <li>
                    Discount rate: <span className="font-semibold">{pct(ASSUMPTIONS.discountRate * 100)}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-8 text-xs text-slate-500">
            All amounts shown in {currencyCode}. Figures are derived from inputs provided and assumptions
            listed under Appendix.
          </div>
        </section>

        <div className="break-before-page" />

        {/* ——— Project Overview ——— */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            Project Overview
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
            <div>
              <Table
                rows={[
                  ["Baseline energy spend (annual)", currency(inputs.energySpend, currencyCode)],
                  ["Expected reduction", pct(inputs.reductionPct)],
                  ["Gross savings (annual)", currency(model.savingsGross, currencyCode)],
                  ["After-tax savings (annual)", currency(model.savingsAfterTax, currencyCode)],
                ]}
              />
            </div>
            <div>
              <Table
                rows={[
                  ["Capex", currency(inputs.capex, currencyCode)],
                  ["Consultant fees", currency(inputs.consultantFees, currencyCode)],
                  ["Grant/support", currency(inputs.grant, currencyCode)],
                  ["Net upfront investment", currency(model.upfront, currencyCode)],
                ]}
              />
            </div>
          </div>
        </section>

        <div className="break-before-page" />

        {/* ——— Investment, Financing & Debt Service ——— */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            Investment, Financing & Debt Service
          </h3>

          <div className="mt-4 text-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b" style={{ borderColor: BRAND.border }}>
                  <th className="py-2">Year</th>
                  <th className="py-2 text-right">Opening</th>
                  <th className="py-2 text-right">Interest</th>
                  <th className="py-2 text-right">Principal</th>
                  <th className="py-2 text-right">Payment</th>
                  <th className="py-2 text-right">Closing</th>
                </tr>
              </thead>
              <tbody>
                {model.amort.map((r) => (
                  <tr key={r.year} className="border-b" style={{ borderColor: BRAND.border }}>
                    <td className="py-2">{r.year}</td>
                    <td className="py-2 text-right">{currency(r.opening, currencyCode)}</td>
                    <td className="py-2 text-right">{currency(r.interest, currencyCode)}</td>
                    <td className="py-2 text-right">{currency(r.principalPaid, currencyCode)}</td>
                    <td className="py-2 text-right">{currency(r.payment, currencyCode)}</td>
                    <td className="py-2 text-right">{currency(r.closing, currencyCode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
              {model.dscr.map((d) => (
                <div key={d.year} className="p-3 rounded-xl border" style={{ borderColor: BRAND.border }}>
                  <div className="text-slate-500">DSCR – Year {d.year}</div>
                  <div className="text-xl font-semibold">{d.dscr.toFixed(2)}</div>
                  <div className="text-slate-500 text-xs">
                    Debt service: {currency(d.debtService, currencyCode)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="break-before-page" />

        {/* ——— ROI & Cashflows ——— */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            ROI & Cash Flow Analysis
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
            <div>
              <Card title="Unlevered (project) cash flows">
                <CFTable cash={model.ocf} currencyCode={currencyCode} />
                <div className="mt-3 text-sm">
                  <div>
                    NPV @ {pct(ASSUMPTIONS.discountRate * 100)}:{" "}
                    <span className="font-semibold">{currency(model.npvUnlevered, currencyCode)}</span>
                  </div>
                  <div>
                    IRR: <span className="font-semibold">{pct(model.irrUnlevered * 100)}</span>
                  </div>
                </div>
              </Card>
            </div>
            <div>
              <Card title="Levered (to equity) cash flows">
                <CFTable cash={model.lcf} currencyCode={currencyCode} />
                <div className="mt-3 text-sm">
                  <div>
                    NPV @ {pct(ASSUMPTIONS.discountRate * 100)}:{" "}
                    <span className="font-semibold">{currency(model.npvLevered, currencyCode)}</span>
                  </div>
                  <div>
                    IRR: <span className="font-semibold">{pct(model.irrLevered * 100)}</span>
                  </div>
                  <div>
                    Simple payback: <span className="font-semibold">{model.paybackYears ?? "–"} years</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <div className="break-before-page" />

        {/* ——— Environmental Impact & Compliance ——— */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            Environmental Impact & Compliance
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
            <div>
              <Card title="Estimated impact (assumption-based)">
                <ul className="mt-2 space-y-1">
                  <li>
                    Baseline energy:{" "}
                    <span className="font-semibold">
                      {Math.round(model.baselineKWh).toLocaleString()} kWh/year
                    </span>
                  </li>
                  <li>
                    Energy saved:{" "}
                    <span className="font-semibold">
                      {Math.round(model.savedKWh).toLocaleString()} kWh/year
                    </span>
                  </li>
                  <li>
                    CO₂e avoided:{" "}
                    <span className="font-semibold">
                      {Math.round(model.co2SavedKg).toLocaleString()} kg CO₂e/year
                    </span>
                  </li>
                </ul>
                <div className="text-xs text-slate-500 mt-2">
                  Assumes energy price {currency(ASSUMPTIONS.energyPriceNOKperKWh)} per kWh and grid factor{" "}
                  {ASSUMPTIONS.gridEmissionFactorKgPerKWh} kg CO₂e/kWh. Replace with metered data if available.
                </div>
              </Card>
            </div>
            <div>
              <Card title="Compliance notes">
                <ul className="mt-2 list-disc pl-5 space-y-1">
                  <li>Financial: NPV/IRR, amortization and DSCR for credit underwriting.</li>
                  <li>Insurance: Lower operational risk via reduced energy dependency.</li>
                  <li>Tax: Depreciation and grant treatment documented; after-tax savings applied.</li>
                </ul>
              </Card>
            </div>
          </div>
        </section>

        <div className="break-before-page" />

        {/* ——— Appendix ——— */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            Appendix
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
            <div>
              <Card title="Inputs">
                <Table
                  rows={[
                    ["Energy spend (annual)", currency(inputs.energySpend, currencyCode)],
                    ["Reduction", pct(inputs.reductionPct)],
                    ["Grant", currency(inputs.grant, currencyCode)],
                    ["Loan amount", currency(inputs.loanAmount, currencyCode)],
                    ["Interest (current)", pct(inputs.rateCurrent)],
                    ["Interest (green)", pct(inputs.rateGreen)],
                    ["Capex", currency(inputs.capex, currencyCode)],
                    ["Consultant fees", currency(inputs.consultantFees, currencyCode)],
                    ["Tax rate", pct(inputs.taxRate)],
                  ]}
                />
              </Card>
            </div>
            <div>
              <Card title="Assumptions">
                <ul className="mt-2 space-y-1">
                  <li>Analysis horizon: {ASSUMPTIONS.analysisYears} years</li>
                  <li>Discount rate: {pct(ASSUMPTIONS.discountRate * 100)}</li>
                  <li>Loan tenor: {ASSUMPTIONS.loanYears} years</li>
                  <li>Depreciation period: {ASSUMPTIONS.depreciationYears} years (straight-line)</li>
                  <li>Energy price: {currency(ASSUMPTIONS.energyPriceNOKperKWh, currencyCode)} / kWh</li>
                  <li>Grid CO₂ factor: {ASSUMPTIONS.gridEmissionFactorKgPerKWh} kg/kWh</li>
                </ul>
                <div className="text-xs text-slate-500 mt-2">
                  Assumptions are placeholders – replace with client-specific values or metered data for bank
                  submissions.
                </div>
              </Card>
            </div>
          </div>
        </section>
      </div>

      {/* Print helpers */}
      <style>{`
        .break-before-page { page-break-before: always; height: 1px; }
        @media print { .break-before-page { break-before: page; } }
      `}</style>
    </div>
  );
});

// —— Small UI helpers ——
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-xl border" style={{ borderColor: BRAND.border }}>
      <div className="text-slate-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
function Table({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full text-sm">
      <tbody className="align-top">
        {rows.map(([l, v], i) => (
          <tr key={i} className={i < rows.length - 1 ? "border-b" : ""} style={{ borderColor: BRAND.border }}>
            <td className="py-2 text-slate-500">{l}</td>
            <td className="py-2 text-right font-medium">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: BRAND.border }}>
      <div className="text-slate-500">{title}</div>
      {children}
    </div>
  );
}
function CFTable({ cash, currencyCode }: { cash: number[]; currencyCode: string }) {
  return (
    <table className="w-full text-sm mt-2">
      <thead>
        <tr className="text-left text-slate-500 border-b" style={{ borderColor: BRAND.border }}>
          <th className="py-2">Year</th>
          {cash.map((_, i) => (
            <th key={i} className="py-2 text-right">
              {i}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="py-2 text-slate-500">CF</td>
          {cash.map((v, i) => (
            <td key={i} className="py-2 text-right font-medium">
              {currency(v, currencyCode)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

export default EnvestoReport;
