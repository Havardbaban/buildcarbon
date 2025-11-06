import React, { useRef, useState, useMemo } from "react";
import EnvestoReport, { EnvestoInputs, Recommendation } from "./EnvestoReport";
import { recommendMeasures } from "./recommend";

export default function App() {
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
    setInputs((prev) => ({ ...prev, [name]: Number(value) }));
  };

  // Compute opportunities from inputs
  const measures: Recommendation[] = useMemo(() => recommendMeasures(inputs), [inputs]);

  // Expose PDF generate()
  const reportRef = useRef<{ generate: () => Promise<void> } | null>(null);
  const handleDownload = async () => {
    await reportRef.current?.generate();
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Envesto – Opportunities & Bank-Grade PDF</h1>

      {/* Inputs */}
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

      {/* Quick visible Opportunities preview */}
      <div className="mt-6 rounded-xl border p-4">
        <div className="text-slate-500">Top Opportunities (preview)</div>
        <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
          {measures.slice(0, 6).map((m) => (
            <li key={m.id} className="flex items-center justify-between">
              <span>{m.title}</span>
              <span className="font-medium">{m.payback_years ?? "–"} yrs</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Your main download button */}
      <div className="mt-6">
        <button
          onClick={handleDownload}
          className="rounded-xl px-4 py-3 text-white"
          style={{ background: "#0E9F6E" }}
        >
          Download PDF report
        </button>
      </div>

      {/* Render the full report off-screen for PDF capture */}
      <div style={{ position: "absolute", left: "-9999px", top: 0, visibility: "hidden" }}>
        <EnvestoReport
          ref={reportRef}
          inputs={inputs}
          companyName="Acme AS"
          projectTitle="Energy Efficiency Upgrade"
          showButton={false}
          measures={measures}
        />
      </div>
    </div>
  );
}
