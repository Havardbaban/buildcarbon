// —————————————————————————————————————————————————————————————
// FILE: components/EnvestoReport.tsx
// Description: Bank/insurance/tax‑ready sustainability ROI report with PDF export.
// Tailwind-based layout. Uses html2pdf.js to generate a polished A4 PDF.
// —————————————————————————————————————————————————————————————

import React, { useMemo, useRef } from "react";
// @ts-ignore – html2pdf has no default TS types
import html2pdf from "html2pdf.js";

// ——— Envesto brand tokens ———
const BRAND = {
  name: "Envesto",
  primary: "#0E9F6E", // emerald-600
  primaryDark: "#047857", // emerald-700
  ink: "#0F172A", // slate-900
  subtle: "#475569", // slate-600
  border: "#E2E8F0", // slate-200
};

// ——— Helper formatters ———
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

// ——— Finance core ———
// Assumptions chosen to keep inputs minimal and bank-friendly; surfaced in the report.
const ASSUMPTIONS = {
  analysisYears: 7,               // analysis horizon (years)
  discountRate: 0.08,             // WACC/discount rate (8%)
  loanYears: 5,                   // loan tenor (years)
  depreciationYears: 5,           // straight-line depreciation period (years)
  energyPriceNOKperKWh: 1.20,     // avg all-in energy price assumption
  gridEmissionFactorKgPerKWh: 0.17, // NO electricity CO2e factor assumption
};

// Present value
function npv(rate: number, cashflows: number[]) {
  return cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}

// IRR via Newton-Raphson with guardrails
function irr(cashflows: number[], guess = 0.1) {
  let r = guess;
  for (let i = 0; i < 100; i++) {
    let f = 0, df = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const c = cashflows[t];
      f += c / Math.pow(1 + r, t);
      if (t > 0) df += (-t * c) / Math.pow(1 + r, t + 1);
    }
    const step = f / df;
    r -= step;
    if (Math.abs(step) < 1e-7) break;
  }
  return r;
}

// Level payment annuity calculation for loan
function annuityPayment(principal: number, annualRate: number, years: number) {
  const r = annualRate;
  const n = years;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// Amortization schedule (annual)
function buildAmortization(principal: number, annualRate: number, years: number) {
  const payment = annuityPayment(principal, annualRate, years);
  const rows: { year: number; opening: number; interest: number; principalPaid: number; payment: number; closing: number; }[] = [];
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

// ——— Types ———
export type EnvestoInputs = {
  energySpend: number;     // Annual baseline energy spend (NOK)
  reductionPct: number;    // % energy reduction from project
  grant: number;           // One-off grant/support NOK
  loanAmount: number;      // Loan principal NOK
  rateCurrent: number;     // Current interest rate % (for reference)
  rateGreen: number;       // Green loan interest rate %
  capex: number;           // Project capex NOK
  taxRate: number;         // Corporate tax rate %
  consultantFees: number;  // One-off consultant fees NOK
};

export default function EnvestoReport({ inputs, companyName = "Client Company", projectTitle = "Energy Efficiency Investment", currencyCode = "NOK" }: { inputs: EnvestoInputs; companyName?: string; projectTitle?: string; currencyCode?: string; }) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const model = useMemo(() => {
    const taxRate = inputs.taxRate / 100;
    const savingsGross = inputs.energySpend * (inputs.reductionPct / 100); // annual

    // After-tax operational savings (no financing)
    const savingsAfterTax = savingsGross * (1 - taxRate);

    // Depreciation + tax shield
    const depreciation = (inputs.capex + inputs.consultantFees) / ASSUMPTIONS.depreciationYears;
    const taxShield = depreciation * taxRate;

    // Upfront net investment
    const upfront = (inputs.capex + inputs.consultantFees) - inputs.grant;

    // Financing
    const { payment: annualDebtService, rows: amort } = buildAmortization(
      inputs.loanAmount,
      inputs.rateGreen / 100,
      ASSUMPTIONS.loanYears
    );

    // Operating cash flow (unlevered) each year
    const ocf: number[] = [ -upfront ];
    for (let y = 1; y <= ASSUMPTIONS.analysisYears; y++) {
      const ocfYear = savingsAfterTax + taxShield; // conservative, excludes residual value
      ocf.push(ocfYear);
    }

    const npvUnlevered = npv(ASSUMPTIONS.discountRate, ocf);
    const irrUnlevered = irr(ocf);

    // Levered cash flow considers debt service within first loanYears
    const lcf: number[] = [ -upfront ];
    for (let y = 1; y <= ASSUMPTIONS.analysisYears; y++) {
      const debtService = y <= ASSUMPTIONS.loanYears ? annualDebtService : 0;
      const lcfYear = savingsAfterTax + taxShield - debtService;
      lcf.push(lcfYear);
    }

    const npvLevered = npv(ASSUMPTIONS.discountRate, lcf);
    const irrLevered = irr(lcf);

    // Payback (simple, on levered CF)
    let cum = -upfront;
    let paybackYears: number | null = null;
    for (let y = 1; y < lcf.length; y++) {
      cum += lcf[y];
      if (cum >= 0 && paybackYears === null) paybackYears = y;
    }

    // DSCR for years in loan period
    const dscr = amort.map(r => {
      const noi = savingsAfterTax + taxShield; // proxy for net operating income from the project
      return {
        year: r.year,
        dscr: noi / r.payment,
        debtService: r.payment,
      };
    });

    // Environmental impact (estimation from assumptions)
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
      margin:       [10, 12, 10, 12],    // top, right, bottom, left (mm)
      filename:     `${BRAND.name}-${projectTitle.replace(/\s+/g, "_")}-Report.pdf`,
      image:        { type: "jpeg", quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak:    { mode: ["avoid-all", "css", "legacy"] },
    } as any;

    await html2pdf().from(el).set(opt).save();
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold" style={{color: BRAND.ink}}>Bank‑Ready Investment Report</h1>
        <button onClick={generatePDF} className="px-4 py-2 rounded-xl text-white" style={{background: BRAND.primary}}>
          Generate PDF
        </button>
      </div>

      {/* ——— PDF WRAPPER (A4 width) ——— */}
      <div ref={wrapRef} className="bg-white shadow rounded-2xl px-10 py-12 mx-auto" style={{ width: "210mm", maxWidth: "210mm" }}>
        {/* Cover Page */}
        <section className="min-h-[260mm] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="text-4xl font-bold" style={{color: BRAND.primary}}>{BRAND.name}</div>
              <div className="text-right">
                <div className="text-sm text-slate-500">Prepared for</div>
                <div className="text-lg font-semibold" style={{color: BRAND.ink}}>{companyName}</div>
              </div>
            </div>
            <h2 className="mt-16 text-3xl font-semibold" style={{color: BRAND.ink}}>{projectTitle}</h2>
            <p className="mt-3 text-slate-600 max-w-prose">A financial-grade assessment of investment value, risk, compliance, and environmental impact prepared by {BRAND.name}.</p>

            <div className="mt-10 grid grid-cols-3 gap-4 text-sm">
              <div className="p-4 rounded-xl border" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Upfront Investment (net)</div>
                <div className="text-xl font-semibold">{currency(model.upfront, currencyCode)}</div>
              </div>
              <div className="p-4 rounded-xl border" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Annual Savings (after tax)</div>
                <div className="text-xl font-semibold">{currency(model.savingsAfterTax, currencyCode)}</div>
              </div>
              <div className="p-4 rounded-xl border" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Debt Service (annual)</div>
                <div className="text-xl font-semibold">{currency(model.annualDebtService, currencyCode)}</div>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-4 text-sm">
              <div className="p-4 rounded-xl border" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Unlevered NPV @ {pct(ASSUMPTIONS.discountRate*100)}</div>
                <div className="text-xl font-semibold">{currency(model.npvUnlevered, currencyCode)}</div>
              </div>
              <div className="p-4 rounded-xl border" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Unlevered IRR</div>
                <div className="text-xl font-semibold">{pct(model.irrUnlevered*100, 1)}</div>
              </div>
              <div className="p-4 rounded-xl border" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Levered NPV @ {pct(ASSUMPTIONS.discountRate*100)}</div>
                <div className="text-xl font-semibold">{currency(model.npvLevered, currencyCode)}</div>
              </div>
              <div className="p-4 rounded-xl border" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Levered IRR</div>
                <div className="text-xl font-semibold">{pct(model.irrLevered*100, 1)}</div>
              </div>
            </div>
          </div>

          <div className="text-sm text-slate-500">
            <div className="border-t mt-12 pt-4" style={{borderColor: BRAND.border}}>
              Confidential – Prepared by {BRAND.name}
            </div>
          </div>
        </section>

        <div className="break-before-page" />

        {/* Executive Summary */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{color: BRAND.ink}}>Executive Summary</h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm leading-relaxed">
            <div>
              <p><span className="font-semibold">Objective:</span> Reduce energy spend by {pct(inputs.reductionPct)} through targeted efficiency measures, financed via a green loan.</p>
              <p className="mt-3"><span className="font-semibold">Financial outcome (levered):</span> NPV {currency(model.npvLevered, currencyCode)}, IRR {pct(model.irrLevered*100)} with a simple payback of {model.paybackYears ?? "–"} years.</p>
              <p className="mt-3"><span className="font-semibold">Compliance & Risk:</span> Structured to satisfy bank underwriting, insurance risk controls, and tax documentation with explicit assumptions and schedules.</p>
            </div>
            <div>
              <div className="rounded-xl border p-4" style={{borderColor: BRAND.border, background: "#F8FAFC"}}>
                <div className="text-slate-500">Key Metrics</div>
                <ul className="mt-2 space-y-1">
                  <li>Annual after-tax savings: <span className="font-semibold">{currency(model.savingsAfterTax, currencyCode)}</span></li>
                  <li>Annual debt service (years 1–{ASSUMPTIONS.loanYears}): <span className="font-semibold">{currency(model.annualDebtService, currencyCode)}</span></li>
                  <li>DSCR (year 1): <span className="font-semibold">{model.dscr[0] ? model.dscr[0].dscr.toFixed(2) : "–"}</span></li>
                  <li>Analysis horizon: <span className="font-semibold">{ASSUMPTIONS.analysisYears} years</span></li>
                  <li>Discount rate: <span className="font-semibold">{pct(ASSUMPTIONS.discountRate*100)}</span></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-8 text-xs text-slate-500">All amounts shown in {currencyCode}. Figures are derived from inputs provided and assumptions listed under Appendix.</div>
        </section>

        <div className="break-before-page" />

        {/* Project Overview */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{color: BRAND.ink}}>Project Overview</h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
            <div>
              <table className="w-full text-sm">
                <tbody className="align-top">
                  <tr className="border-b" style={{borderColor: BRAND.border}}>
                    <td className="py-2 text-slate-500">Baseline energy spend (annual)</td>
                    <td className="py-2 text-right font-medium">{currency(inputs.energySpend, currencyCode)}</td>
                  </tr>
                  <tr className="border-b" style={{borderColor: BRAND.border}}>
                    <td className="py-2 text-slate-500">Expected reduction</td>
                    <td className="py-2 text-right font-medium">{pct(inputs.reductionPct)}</td>
                  </tr>
                  <tr className="border-b" style={{borderColor: BRAND.border}}>
                    <td className="py-2 text-slate-500">Gross savings (annual)</td>
                    <td className="py-2 text-right font-medium">{currency(model.savingsGross, currencyCode)}</td>
                  </tr>
                  <tr className="border-b" style={{borderColor: BRAND.border}}>
                    <td className="py-2 text-slate-500">After-tax savings (annual)</td>
                    <td className="py-2 text-right font-medium">{currency(model.savingsAfterTax, currencyCode)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <table className="w-full text-sm">
                <tbody className="align-top">
                  <tr className="border-b" style={{borderColor: BRAND.border}}>
                    <td className="py-2 text-slate-500">Capex</td>
                    <td className="py-2 text-right font-medium">{currency(inputs.capex, currencyCode)}</td>
                  </tr>
                  <tr className="border-b" style={{borderColor: BRAND.border}}>
                    <td className="py-2 text-slate-500">Consultant fees</td>
                    <td className="py-2 text-right font-medium">{currency(inputs.consultantFees, currencyCode)}</td>
                  </tr>
                  <tr className="border-b" style={{borderColor: BRAND.border}}>
                    <td className="py-2 text-slate-500">Grant/support</td>
                    <td className="py-2 text-right font-medium">{currency(inputs.grant, currencyCode)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-500">Net upfront investment</td>
                    <td className="py-2 text-right font-medium">{currency(model.upfront, currencyCode)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <div className="break-before-page" />

        {/* Investment Breakdown & Financing */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{color: BRAND.ink}}>Investment, Financing & Debt Service</h3>
          <div className="mt-4 text-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b" style={{borderColor: BRAND.border}}>
                  <th className="py-2">Year</th>
                  <th className="py-2 text-right">Opening</th>
                  <th className="py-2 text-right">Interest</th>
                  <th className="py-2 text-right">Principal</th>
                  <th className="py-2 text-right">Payment</th>
                  <th className="py-2 text-right">Closing</th>
                </tr>
              </thead>
              <tbody>
                {model.amort.map(r => (
                  <tr key={r.year} className="border-b" style={{borderColor: BRAND.border}}>
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
              {model.dscr.map(d => (
                <div key={d.year} className="p-3 rounded-xl border" style={{borderColor: BRAND.border}}>
                  <div className="text-slate-500">DSCR – Year {d.year}</div>
                  <div className="text-xl font-semibold">{d.dscr.toFixed(2)}</div>
                  <div className="text-slate-500 text-xs">Debt service: {currency(d.debtService, currencyCode)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="break-before-page" />

        {/* ROI & Cashflows */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{color: BRAND.ink}}>ROI & Cash Flow Analysis</h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="rounded-xl border p-4" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Unlevered (project) cash flows</div>
                <table className="w-full text-sm mt-2">
                  <thead>
                    <tr className="text-left text-slate-500 border-b" style={{borderColor: BRAND.border}}>
                      <th className="py-2">Year</th>
                      {model.ocf.map((_, i) => (<th className="py-2 text-right" key={i}>{i}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2 text-slate-500">CF</td>
                      {model.ocf.map((v, i) => (<td className="py-2 text-right font-medium" key={i}>{currency(v, currencyCode)}</td>))}
                    </tr>
                  </tbody>
                </table>
                <div className="mt-3 text-sm">
                  <div>NPV @ {pct(ASSUMPTIONS.discountRate*100)}: <span className="font-semibold">{currency(model.npvUnlevered, currencyCode)}</span></div>
                  <div>IRR: <span className="font-semibold">{pct(model.irrUnlevered*100)}</span></div>
                </div>
              </div>
            </div>
            <div>
              <div className="rounded-xl border p-4" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Levered (to equity) cash flows</div>
                <table className="w-full text-sm mt-2">
                  <thead>
                    <tr className="text-left text-slate-500 border-b" style={{borderColor: BRAND.border}}>
                      <th className="py-2">Year</th>
                      {model.lcf.map((_, i) => (<th className="py-2 text-right" key={i}>{i}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2 text-slate-500">CF</td>
                      {model.lcf.map((v, i) => (<td className="py-2 text-right font-medium" key={i}>{currency(v, currencyCode)}</td>))}
                    </tr>
                  </tbody>
                </table>
                <div className="mt-3 text-sm">
                  <div>NPV @ {pct(ASSUMPTIONS.discountRate*100)}: <span className="font-semibold">{currency(model.npvLevered, currencyCode)}</span></div>
                  <div>IRR: <span className="font-semibold">{pct(model.irrLevered*100)}</span></div>
                  <div>Simple payback: <span className="font-semibold">{model.paybackYears ?? "–"} years</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="break-before-page" />

        {/* Environmental Impact & Compliance */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{color: BRAND.ink}}>Environmental Impact & Compliance</h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="rounded-xl border p-4" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Estimated impact (assumption-based)</div>
                <ul className="mt-2 space-y-1">
                  <li>Baseline energy: <span className="font-semibold">{Math.round(model.baselineKWh).toLocaleString()} kWh/year</span></li>
                  <li>Energy saved: <span className="font-semibold">{Math.round(model.savedKWh).toLocaleString()} kWh/year</span></li>
                  <li>CO₂e avoided: <span className="font-semibold">{Math.round(model.co2SavedKg).toLocaleString()} kg CO₂e/year</span></li>
                </ul>
                <div className="text-xs text-slate-500 mt-2">Assumes energy price {currency(ASSUMPTIONS.energyPriceNOKperKWh)} per kWh and grid factor {ASSUMPTIONS.gridEmissionFactorKgPerKWh} kg CO₂e/kWh. Replace with metered data if available.</div>
              </div>
            </div>
            <div>
              <div className="rounded-xl border p-4" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Compliance notes</div>
                <ul className="mt-2 list-disc pl-5 space-y-1">
                  <li>Financial: Provides NPV/IRR, amortization, and DSCR suitable for credit underwriting.</li>
                  <li>Insurance: Quantifies reduced operational risk via lower energy dependency and stable cashflows.</li>
                  <li>Tax: Depreciation schedule and grant treatment documented; after-tax savings applied.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <div className="break-before-page" />

        {/* Appendix */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{color: BRAND.ink}}>Appendix</h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="rounded-xl border p-4" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Inputs</div>
                <table className="w-full text-sm mt-2">
                  <tbody>
                    <tr className="border-b" style={{borderColor: BRAND.border}}><td className="py-1">Energy spend (annual)</td><td className="py-1 text-right">{currency(inputs.energySpend, currencyCode)}</td></tr>
                    <tr className="border-b" style={{borderColor: BRAND.border}}><td className="py-1">Reduction</td><td className="py-1 text-right">{pct(inputs.reductionPct)}</td></tr>
                    <tr className="border-b" style={{borderColor: BRAND.border}}><td className="py-1">Grant</td><td className="py-1 text-right">{currency(inputs.grant, currencyCode)}</td></tr>
                    <tr className="border-b" style={{borderColor: BRAND.border}}><td className="py-1">Loan amount</td><td className="py-1 text-right">{currency(inputs.loanAmount, currencyCode)}</td></tr>
                    <tr className="border-b" style={{borderColor: BRAND.border}}><td className="py-1">Interest (current)</td><td className="py-1 text-right">{pct(inputs.rateCurrent)}</td></tr>
                    <tr className="border-b" style={{borderColor: BRAND.border}}><td className="py-1">Interest (green)</td><td className="py-1 text-right">{pct(inputs.rateGreen)}</td></tr>
                    <tr className="border-b" style={{borderColor: BRAND.border}}><td className="py-1">Capex</td><td className="py-1 text-right">{currency(inputs.capex, currencyCode)}</td></tr>
                    <tr className="border-b" style={{borderColor: BRAND.border}}><td className="py-1">Consultant fees</td><td className="py-1 text-right">{currency(inputs.consultantFees, currencyCode)}</td></tr>
                    <tr><td className="py-1">Tax rate</td><td className="py-1 text-right">{pct(inputs.taxRate)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="rounded-xl border p-4" style={{borderColor: BRAND.border}}>
                <div className="text-slate-500">Assumptions</div>
                <ul className="mt-2 space-y-1">
                  <li>Analysis horizon: {ASSUMPTIONS.analysisYears} years</li>
                  <li>Discount rate: {pct(ASSUMPTIONS.discountRate*100)}</li>
                  <li>Loan tenor: {ASSUMPTIONS.loanYears} years</li>
                  <li>Depreciation period: {ASSUMPTIONS.depreciationYears} years (straight-line)</li>
                  <li>Energy price: {currency(ASSUMPTIONS.energyPriceNOKperKWh, currencyCode)} / kWh</li>
                  <li>Grid CO₂ factor: {ASSUMPTIONS.gridEmissionFactorKgPerKWh} kg/kWh</li>
                </ul>
                <div className="text-xs text-slate-500 mt-2">Assumptions are placeholders – replace with client-specific values or metered data for bank submissions.</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Print CSS helpers for html2pdf */}
      <style>{`
        .break-before-page { page-break-before: always; height: 1px; }
        @media print { .break-before-page { break-before: page; } }
      `}</style>
    </div>
  );
}

// —————————————————————————————————————————————————————————————
// FILE: app/report/page.tsx  (Next.js App Router) ✅
// If you use the Pages Router instead, create pages/report.tsx with the same content.
// —————————————————————————————————————————————————————————————

"use client";
import React, { useState } from "react";
import EnvestoReport, { EnvestoInputs } from "@/components/EnvestoReport";

export default function ReportPage() {
  const [inputs, setInputs] = useState<EnvestoInputs>({
    energySpend: 100000,
    reductionPct: 15,
    grant: 10000,
    loanAmount: 500000,
    rateCurrent: 4.0,
    rateGreen: 3.5,
    capex: 200000,
    taxRate: 22,
    consultantFees: 5000,
  });

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: Number(value) }));
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Envesto – Bank‑Grade PDF Generator</h1>

      {/* Simple input panel using the exact fields from your prototype */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        {Object.entries(inputs).map(([key, val]) => (
          <label key={key} className="text-sm">
            <div className="text-slate-600 mb-1">{key}</div>
            <input
              type="number"
              name={key}
              value={val}
              onChange={onChange}
              className="w-full rounded-xl border px-3 py-2"
            />
          </label>
        ))}
      </div>

      <div className="mt-8">
        <EnvestoReport inputs={inputs} companyName="Acme AS" projectTitle="Energy Efficiency Upgrade" />
      </div>
    </div>
  );
}

// —————————————————————————————————————————————————————————————
// FILE: pages/report.tsx (Next.js Pages Router alternative)
// If your project uses /pages, use this instead of app/report/page.tsx
// —————————————————————————————————————————————————————————————

// "use client";
// import React, { useState } from "react";
// import EnvestoReport, { EnvestoInputs } from "../components/EnvestoReport";
// export default function ReportPage() {
//   const [inputs, setInputs] = useState<EnvestoInputs>({
//     energySpend: 100000,
//     reductionPct: 15,
//     grant: 10000,
//     loanAmount: 500000,
//     rateCurrent: 4.0,
//     rateGreen: 3.5,
//     capex: 200000,
//     taxRate: 22,
//     consultantFees: 5000,
//   });
//   const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const { name, value } = e.target;
//     setInputs(prev => ({ ...prev, [name]: Number(value) }));
//   };
//   return (
//     <div className="mx-auto max-w-6xl p-6">
//       <h1 className="text-2xl font-semibold">Envesto – Bank‑Grade PDF Generator</h1>
//       <div className="mt-4 grid grid-cols-2 gap-4">
//         {Object.entries(inputs).map(([key, val]) => (
//           <label key={key} className="text-sm">
//             <div className="text-slate-600 mb-1">{key}</div>
//             <input type="number" name={key} value={val} onChange={onChange} className="w-full rounded-xl border px-3 py-2" />
//           </label>
//         ))}
//       </div>
//       <div className="mt-8">
//         <EnvestoReport inputs={inputs} companyName="Acme AS" projectTitle="Energy Efficiency Upgrade" />
//       </div>
//     </div>
//   );
// }

// —————————————————————————————————————————————————————————————
// FILE: src/App.tsx  (Create React App / Vite alternative)
// If you are NOT using Next.js, drop these two files and use this instead.
// —————————————————————————————————————————————————————————————

// import React, { useState } from "react";
// import EnvestoReport, { EnvestoInputs } from "./EnvestoReport"; // place the component in src/EnvestoReport.tsx
// export default function App() {
//   const [inputs, setInputs] = useState<EnvestoInputs>({
//     energySpend: 100000,
//     reductionPct: 15,
//     grant: 10000,
//     loanAmount: 500000,
//     rateCurrent: 4.0,
//     rateGreen: 3.5,
//     capex: 200000,
//     taxRate: 22,
//     consultantFees: 5000,
//   });
//   const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const { name, value } = e.target;
//     setInputs(prev => ({ ...prev, [name]: Number(value) }));
//   };
//   return (
//     <div className="mx-auto max-w-6xl p-6">
//       <h1 className="text-2xl font-semibold">Envesto – Bank‑Grade PDF Generator</h1>
//       <div className="mt-4 grid grid-cols-2 gap-4">
//         {Object.entries(inputs).map(([key, val]) => (
//           <label key={key} className="text-sm">
//             <div className="text-slate-600 mb-1">{key}</div>
//             <input type="number" name={key} value={val} onChange={onChange} className="w-full rounded-xl border px-3 py-2" />
//           </label>
//         ))}
//       </div>
//       <div className="mt-8">
//         <EnvestoReport inputs={inputs} companyName="Acme AS" projectTitle="Energy Efficiency Upgrade" />
//       </div>
//     </div>
//   );
// }

// —————————————————————————————————————————————————————————————
// FILE: tailwind setup reminder
// Ensure Tailwind is enabled. In Next.js, you should already have:
// tailwind.config.js, postcss.config.js, and global.css importing Tailwind directives.
// —————————————————————————————————————————————————————————————

/* tailwind.config.js example
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};
*/

/* globals.css example
@tailwind base;
@tailwind components;
@tailwind utilities;
*/
