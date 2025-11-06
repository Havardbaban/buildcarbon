import React, { useRef, useState } from "react";
import EnvestoReport, { EnvestoInputs } from "./EnvestoReport";

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

  // NEW: ref to call generate()
  const reportRef = useRef<{ generate: () => Promise<void> } | null>(null);

  const handleDownload = async () => {
    await reportRef.current?.generate();
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Envesto – Bank-Grade PDF Generator</h1>

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

      {/* Your page content… */}

      {/* Your existing green button should call handleDownload */}
      <div className="mt-6">
        <button
          onClick={handleDownload}
          className="rounded-xl px-4 py-3 text-white"
          style={{ background: "#0E9F6E" }}
        >
          Download PDF report
        </button>
      </div>

      {/* Render the bank-grade report off-screen; it will be used only for PDF generation */}
      <div style={{ position: "absolute", left: "-99999px", top: 0 }}>
        <EnvestoReport
          ref={reportRef}
          inputs={inputs}
          companyName="Acme AS"
          projectTitle="Energy Efficiency Upgrade"
          showButton={false} // hide internal button
        />
      </div>
    </div>
  );
}
