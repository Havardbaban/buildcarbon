import React, { useMemo, useState } from 'react'
import html2pdf from "html2pdf.js";

function currency(n: number) {
  if (!Number.isFinite(n)) return "–";
  return new Intl.NumberFormat("no-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(n);
}


export default function App() {
  const [inputs, setInputs] = useState({
    energySpend: 100000,
    reductionPct: 15,
    grant: 10000,
    loanAmount: 500000,
    rateCurrent: 4.0,
    rateGreen: 3.5,
    capex: 20000,
    taxRate: 22,
    consultantFees: 5000
  })

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputs(prev => ({ ...prev, [e.target.name]: Number(e.target.value) }))
  }

  const results = useMemo(() => {
    const energySavings = (inputs.energySpend * inputs.reductionPct) / 100
    const interestSavings = ((inputs.rateCurrent - inputs.rateGreen) / 100) * inputs.loanAmount
    const taxSavings = (inputs.capex * inputs.taxRate) / 100
    const recurringAnnual = energySavings + interestSavings + inputs.consultantFees
    const firstYearTotal = recurringAnnual + inputs.grant + taxSavings
    const paybackYears = recurringAnnual > 0 ? inputs.capex / recurringAnnual : Infinity
    return { energySavings, interestSavings, taxSavings, recurringAnnual, firstYearTotal, paybackYears }
  }, [inputs])

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="px-6 py-10 bg-gradient-to-b from-emerald-50 to-white">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
              Turn compliance into profit:
              <span className="block text-emerald-600">CO₂ & ESG reporting for construction SMEs</span>
            </h1>
            <p className="mt-4 text-lg text-gray-700">
              Upload your energy/fuel data and generate tender-ready reports — while uncovering real savings from energy, grants, taxes and green finance.
            </p>
            <ul className="mt-6 space-y-2 text-gray-800">
              <li>• Save on energy & fuel with concrete actions</li>
              <li>• Unlock grants and tax relief with a clear baseline</li>
              <li>• Qualify for better loan terms with green documentation</li>
            </ul>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6 border">
            <h2 className="text-xl font-semibold mb-4">60-second ROI Calculator</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Annual energy/fuel spend (€)" name="energySpend" value={inputs.energySpend} onChange={onChange} />
              <Field label="Expected reduction (%)" name="reductionPct" value={inputs.reductionPct} onChange={onChange} />
              <Field label="One-off grant (€)" name="grant" value={inputs.grant} onChange={onChange} />
              <Field label="Outstanding loan (€)" name="loanAmount" value={inputs.loanAmount} onChange={onChange} />
              <Field label="Current interest (%)" name="rateCurrent" value={inputs.rateCurrent} onChange={onChange} />
              <Field label="Green interest (%)" name="rateGreen" value={inputs.rateGreen} onChange={onChange} />
              <Field label="Green capex (€)" name="capex" value={inputs.capex} onChange={onChange} />
              <Field label="Corporate tax rate (%)" name="taxRate" value={inputs.taxRate} onChange={onChange} />
              <Field label="Consultant fees replaced (€/yr)" name="consultantFees" value={inputs.consultantFees} onChange={onChange} />
            </div>

           <div id="report-section" className="mt-5 p-4 bg-emerald-50 rounded-xl">
  <h3 className="font-semibold mb-2">Results</h3>
  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
    <KPI label="Energy savings" value={currency(results.energySavings)} />
    <KPI label="Interest savings" value={currency(results.interestSavings)} />
    <KPI label="Tax savings (year 1)" value={currency(results.taxSavings)} />
    <KPI label="Recurring annual savings" value={currency(results.recurringAnnual)} />
    <KPI label="First-year total benefit" value={currency(results.firstYearTotal)} />
    <KPI
      label="Payback period"
      value={
        Number.isFinite(results.paybackYears)
          ? `${(results.paybackYears * 12).toFixed(0)} months`
          : "–"
      }
    />
  </div>
  <p className="mt-3 text-xs text-gray-600">
    Illustrative ROI; actual results depend on measures and financing approval.
  </p>

 
/* PDF Download Button */
const handleDownload = async () => {
  const el = document.getElementById("report-section");
  if (!el) return;

  const { default: html2pdf } = await import("html2pdf.js");
  const opt = {
    margin: 0.5,
    filename: "BuildCarbon_Report.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
  };
  (html2pdf as any)().set(opt).from(el).save();
};

<button
  onClick={handleDownload}
  className="mt-4 px-5 py-3 rounded-xl bg-emerald-600 text-white font-semibold shadow hover:bg-emerald-700"
>
  Download PDF report
</button>


      <section className="px-6 py-10">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          <Feature title="Built for Norwegian tenders" desc="Generate simple CO₂ summaries aligned to local requirements and export project-ready PDFs." />
          <Feature title="Partner-friendly" desc="Consultants and suppliers can white-label reports and invite their clients." />
          <Feature title="No hardware required" desc="Start with spreadsheets and invoices; add integrations later (Tripletex, Visma, telematics)." />
        </div>
      </section>

      <section className="px-6 pb-16">
        <div className="max-w-4xl mx-auto bg-gray-50 border rounded-2xl p-8 text-center">
          <h3 className="text-2xl font-bold">Ready to try with your data?</h3>
          <p className="mt-2 text-gray-700">Bring one month of energy & fuel data. We’ll produce a free baseline report and savings plan.</p>
          <div className="mt-6 flex items-center justify-center gap-3">
  <a
    href="https://forms.gle/WBfhFyUynKwqPdt88"
    target="_blank"
    rel="noreferrer"
    className="px-5 py-3 rounded-xl bg-emerald-600 text-white font-semibold shadow hover:bg-emerald-700"
  >
    Book a pilot
  </a>

  <a
    href="/sample-report.pdf"
    download
    className="px-5 py-3 rounded-xl bg-white border font-semibold hover:bg-gray-100"
  >
    Download sample report
  </a>
</div>

        </div>
      </section>

      <footer className="px-6 py-10 border-t text-sm text-gray-600">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} BuildCarbon — Simple ESG for construction SMEs.</p>
          <p>Disclaimer: Illustrative ROI; not financial advice.</p>
        </div>
      </footer>
    </div>
  )
}

function Field(props: { label: string; name: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 text-gray-700">{props.label}</span>
      <input
        type="number"
        step="any"
        name={props.name}
        value={props.value}
        onChange={props.onChange}
        className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
      />
    </label>
  )
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border p-3 text-left">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 border">
      <h4 className="font-semibold text-lg">{title}</h4>
      <p className="mt-2 text-gray-700">{desc}</p>
    </div>
  )
}
