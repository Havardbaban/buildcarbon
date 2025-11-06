import React, { useState } from "react";
import Nav from "../components/Nav";
import EnvestoReport, { EnvestoInputs } from "../EnvestoReport";

const DEMO: EnvestoInputs = {
  energySpend: 100000,
  reductionPct: 15,
  grant: 10000,
  loanAmount: 500000,
  rateCurrent: 4.0,
  rateGreen: 3.5,
  capex: 200000,
  taxRate: 22,
  consultantFees: 5000,
};

export default function Demo() {
  const [inputs, setInputs] = useState<EnvestoInputs>(DEMO);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: Number(value) }));
  };

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Demo Company — Calculator & PDF</h1>
        <p className="text-slate-600 mt-1 text-sm">
          Adjust the inputs or press <span className="font-medium">Generate PDF</span> inside the report.
        </p>

        <div className="mt-6 grid md:grid-cols-2 gap-4">
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
      </main>
    </div>
  );
}
