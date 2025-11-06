// FILE: src/EnvestoReport.tsx
// Bank/insurance/tax-ready ROI report with PDF export + Opportunities.
// Uses html2pdf.js. Exposes ref.generate() for external download buttons.

import React, { useMemo, useRef, forwardRef, useImperativeHandle } from "react";
// @ts-ignore
import html2pdf from "html2pdf.js";

export type EnvestoInputs = {
  energySpend: number;
  reductionPct: number;
  grant: number;
  loanAmount: number;
  rateCurrent: number;
  rateGreen: number;
  capex: number;
  taxRate: number;
  consultantFees: number;
};

export type Recommendation = {
  id: string;
  title: string;
  category: string;
  trigger: string;
  desc: string;
  capex: number;
  lifetime_years: number;
  annual_nok_save: number;
  annual_kwh_save: number;
  annual_co2e_save_kg: number;
  payback_years: number | null;
  npv: number;
};

type Props = {
  inputs: EnvestoInputs;
  companyName?: string;
  projectTitle?: string;
  currencyCode?: string;
  showButton?: boolean;
  measures?: Recommendation[];
};

const BRAND = {
  name: "Envesto",
  primary: "#0E9F6E",
  ink: "#0F172A",
  border: "#E2E8F0",
};

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

const ASSUMPTIONS = {
  analysisYears: 7,
  discountRate: 0.08,
  loanYears: 5,
  depreciationYears: 5,
  energyPriceNOKperKWh: 1.2,
  gridEmissionFactorKgPerKWh: 0.17,
};

function npv(rate: number, cash: number[]) {
  return cash.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}
function irr(cashflows: number[], guess = 0.1) {
  let r = guess;
  for (let i = 0; i < 100; i++) {
    let f = 0,
      df = 0;
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

const EnvestoReport = forwardRef(function EnvestoReport(
  {
    inputs,
    companyName = "Client Company",
    projectTitle = "Energy Efficiency Investment",
    currencyCode = "NOK",
    showButton = true,
    measures = [],
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

    const ocf: number[] = [-upfront];
    for (let y = 1; y <= ASSUMPTIONS.analysisYears; y++) ocf.push(savingsAfterTax + taxShield);
    const npvUnlevered = npv(ASSUMPTIONS.discountRate, ocf);
    const irrUnlevered = irr(ocf);

    const lcf: number[] = [-upfront];
    for (let y = 1; y <= ASSUMPTIONS.analysisYears; y++) {
      const ds = y <= ASSUMPTIONS.loanYears ? annualDebtService : 0;
      lcf.push(savingsAfterTax + taxShield - ds);
    }
    const npvLevered = npv(ASSUMPTIONS.discountRate, lcf);
    const irrLevered = irr(lcf);

    let cum = -upfront;
    let paybackYears: number | null = null;
    for (let y = 1; y < lcf.length; y++) {
      cum += lcf[y];
      if (cum >= 0 && paybackYears === null) paybackYears = y;
    }

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
      baselineKWh,
      savedKWh,
      co2SavedKg,
    };
  }, [inputs]);

  // Generate PDF (safe width, reliable download)
  const generatePDF = async () => {
    const el = wrapRef.current;
    if (!el) return;
    const opt = {
      margin: [10, 12, 10, 12],
      filename: `${BRAND.name}-${projectTitle.replace(/\s+/g, "_")}-Report.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    } as any;
    try {
      await (html2pdf() as any).from(el).set(opt).save();
    } catch {
      const pdf = await (html2pdf() as any).from(el).set(opt).toPdf().get("pdf");
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = opt.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  };

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

      {/* PDF wrapper – 186mm matches a4 minus 12mm margins on both sides */}
      <div
        ref={wrapRef}
        className="bg-white shadow rounded-2xl px-10 py-12 mx-auto"
        style={{ width: "186mm", maxWidth: "186mm" }}
      >
        {/* COVER */}
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
              A financial-grade assessment of investment value, risk, compliance, environmental impact, and
              actionable opportunities prepared by {BRAND.name}.
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

        {/* EXEC SUMMARY */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            Executive Summary
          </h3>
          <div className="mt-4 text-sm leading-relaxed">
            <p>
              <span className="font-semibold">Objective:</span> Reduce energy spend by{" "}
              {pct(inputs.reductionPct)} via efficiency measures financed by a green loan.
            </p>
            <p className="mt-3">
              <span className="font-semibold">Financial outcome (levered):</span> NPV{" "}
              {currency(model.npvLevered, currencyCode)}, IRR {pct(model.irrLevered * 100)} with simple payback{" "}
              {model.paybackYears ?? "–"} years.
            </p>
            <p className="mt-3">
              <span className="font-semibold">Opportunities:</span> The next sections document the measures with
              quantified savings, finance, and proof notes.
            </p>
          </div>
        </section>

        <div className="break-before-page" />

        {/* OPPORTUNITIES TABLE */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            Opportunities (Recommended Measures)
          </h3>
          <div className="mt-4 text-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b" style={{ borderColor: BRAND.border }}>
                  <th className="py-2">Measure</th>
                  <th className="py-2">Category</th>
                  <th className="py-2 text-right">Capex</th>
                  <th className="py-2 text-right">NOK/yr</th>
                  <th className="py-2 text-right">kWh/yr</th>
                  <th className="py-2 text-right">CO₂e kg/yr</th>
                  <th className="py-2 text-right">Payback</th>
                  <th className="py-2 text-right">NPV</th>
                </tr>
              </thead>
              <tbody>
                {measures.map((m) => (
                  <tr key={m.id} className="border-b" style={{ borderColor: BRAND.border }}>
                    <td className="py-2">{m.title}</td>
                    <td className="py-2">{m.category}</td>
                    <td className="py-2 text-right">{currency(m.capex, currencyCode)}</td>
                    <td className="py-2 text-right">{currency(m.annual_nok_save, currencyCode)}</td>
                    <td className="py-2 text-right">{Math.round(m.annual_kwh_save).toLocaleString()}</td>
                    <td className="py-2 text-right">{Math.round(m.annual_co2e_save_kg).toLocaleString()}</td>
                    <td className="py-2 text-right">{m.payback_years ?? "–"} yrs</td>
                    <td className="py-2 text-right">{currency(m.npv, currencyCode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 text-xs text-slate-500">
              Savings and finance are first-pass estimates based on site spend and default factors; refine with
              metered data and quotes for bank submissions.
            </div>
          </div>
        </section>

        <div className="break-before-page" />

        {/* MEASURE SHEETS */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            Measure Sheets (Proof & Implementation)
          </h3>

          <div className="mt-4 space-y-6">
            {measures.map((m) => (
              <div key={m.id} className="rounded-xl border p-4" style={{ borderColor: BRAND.border }}>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <div className="text-lg font-semibold" style={{ color: BRAND.ink }}>
                      {m.title}
                    </div>
                    <div className="text-slate-500 text-sm">{m.category} • Trigger: {m.trigger}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div>Capex: <span className="font-semibold">{currency(m.capex, currencyCode)}</span></div>
                    <div>Payback: <span className="font-semibold">{m.payback_years ?? "–"} yrs</span></div>
                    <div>NPV: <span className="font-semibold">{currency(m.npv, currencyCode)}</span></div>
                  </div>
                </div>

                <p className="mt-3 text-sm">{m.desc}</p>

                <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                  <Stat label="NOK saved / yr" value={currency(m.annual_nok_save, currencyCode)} />
                  <Stat label="kWh saved / yr" value={Math.round(m.annual_kwh_save).toLocaleString()} />
                  <Stat label="CO₂e avoided / yr" value={`${Math.round(m.annual_co2e_save_kg).toLocaleString()} kg`} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <Card title="Evidence / Proof">
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Data trigger: {m.trigger}</li>
                      <li>Add photos/notes: before/after, meter trends, vendor quotes.</li>
                      <li>Baseline method: 12-month average normalized for weather/occupancy.</li>
                    </ul>
                  </Card>
                  <Card title="M&V Plan (Post-Implementation)">
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Track meter trend vs. baseline for 3–6 months.</li>
                      <li>Normalize for weather/occupancy; document calculation.</li>
                      <li>Status stages: Proposed → Approved → Implemented → Verified.</li>
                    </ul>
                  </Card>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="break-before-page" />

        {/* PROJECT OVERVIEW */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            Project Overview
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
            <Table
              rows={[
                ["Baseline energy spend (annual)", currency(inputs.energySpend, currencyCode)],
                ["Expected reduction", pct(inputs.reductionPct)],
                ["Gross savings (annual)", currency(model.savingsGross, currencyCode)],
                ["After-tax savings (annual)", currency(model.savingsAfterTax, currencyCode)],
              ]}
            />
            <Table
              rows={[
                ["Capex", currency(inputs.capex, currencyCode)],
                ["Consultant fees", currency(inputs.consultantFees, currencyCode)],
                ["Grant/support", currency(inputs.grant, currencyCode)],
                ["Net upfront investment", currency(model.upfront, currencyCode)],
              ]}
            />
          </div>
        </section>

        <div className="break-before-page" />

        {/* FINANCING & DSCR */}
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
              {model.amort.map((r, idx) => {
                const dscr =
                  (model.savingsAfterTax + (inputs.taxRate / 100) * ((inputs.capex + inputs.consultantFees) / ASSUMPTIONS.depreciationYears)) /
                  r.payment;
                return (
                  <div key={idx} className="p-3 rounded-xl border" style={{ borderColor: BRAND.border }}>
                    <div className="text-slate-500">DSCR – Year {r.year}</div>
                    <div className="text-xl font-semibold">{dscr.toFixed(2)}</div>
                    <div className="text-slate-500 text-xs">Debt service: {currency(r.payment, currencyCode)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div className="break-before-page" />

        {/* ROI & CASHFLOWS */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            ROI & Cash Flow Analysis
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
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
        </section>

        <div className="break-before-page" />

        {/* ENVIRONMENTAL & COMPLIANCE */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            Environmental Impact & Compliance
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
            <Card title="Estimated impact (assumption-based)">
              <ul className="mt-2 space-y-1">
                <li>
                  Baseline energy:{" "}
                  <span className="font-semibold">{Math.round(model.baselineKWh).toLocaleString()} kWh/yr</span>
                </li>
                <li>
                  Energy saved:{" "}
                  <span className="font-semibold">{Math.round(model.savedKWh).toLocaleString()} kWh/yr</span>
                </li>
                <li>
                  CO₂e avoided:{" "}
                  <span className="font-semibold">
                    {Math.round(model.co2SavedKg).toLocaleString()} kg CO₂e/yr
                  </span>
                </li>
              </ul>
              <div className="text-xs text-slate-500 mt-2">
                Assumes energy price {currency(ASSUMPTIONS.energyPriceNOKperKWh)} / kWh and grid factor{" "}
                {ASSUMPTIONS.gridEmissionFactorKgPerKWh} kg CO₂e/kWh. Replace with metered data if available.
              </div>
            </Card>
            <Card title="Compliance notes">
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Financial: NPV/IRR, amortization and DSCR for credit underwriting.</li>
                <li>Insurance: Lower operational risk via reduced energy dependency.</li>
                <li>Tax: Depreciation and grant treatment documented; after-tax savings applied.</li>
              </ul>
            </Card>
          </div>
        </section>

        <div className="break-before-page" />

        {/* APPENDIX */}
        <section className="min-h-[260mm]">
          <h3 className="text-2xl font-semibold" style={{ color: BRAND.ink }}>
            Appendix
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
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
        </section>
      </div>

      {/* Print + overflow safety */}
      <style>{`
        * { box-sizing: border-box; }
        .break-before-page { page-break-before: always; height: 1px; }
        @media print { .break-before-page { break-before: page; } }
        table { table-layout: fixed; width: 100%; }
        td, th { word-break: break-word; }
      `}</style>
    </div>
  );
});

// Small UI helpers
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-xl border" style={{ borderColor: BRAND.border }}>
      <div className="text-slate-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
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
