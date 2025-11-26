import React, { useState } from "react";
import EnvestoReport, { EnvestoInputs } from "../EnvestoReport";

// Default demo input values
const DEMO: EnvestoInputs = {
  energySpend: 100000,
  reductionPct: 15,
  grant: 10000,
  loanAmount: 80000,
  rateCurrent: 4.0,
  rateIncentive: 3.5,
  capex: 200000,
  taxRate: 22,
  consultantFees: 5000,
};

export default function Demo({ disabled }: { disabled?: boolean }) {
  // 🔒 If disabled → show “coming soon”
  if (disabled) {
    return (
      <main className="mx-auto max-w-xl px-4 py-8 text-center opacity-70">
        <h1 className="text-2xl font-semibold mb-3">Demo kommer snart</h1>
        <p className="text-slate-600">
          Denne funksjonen er deaktivert i MVP-versjonen men vil bli aktiv i demoen for pilotkunder.
        </p>
      </main>
    );
  }

  // 🔓 Otherwise use original demo logic
  const [inputs, setInputs] = useState<EnvestoInputs>(DEMO);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: Number(value) }));
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Demo Company — Calculator & PDF</h1>
      <p className="text-slate-600 mt-1 text-sm">
        Adjust the inputs or press <span className="font-medium">Generate PDF</span> inside the report.
      </p>

      <div className="mt-6 grid md:grid-cols-2 gap-4">
        {Object.entries(inputs).map(([key, val]) => (
          <label key={key} className="text-sm">
            <div className="text-slate-600 mb-1 font-medium">{key}</div>
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
        <EnvestoReport
          inputs={inputs}
          companyName="Acme AS"
          projectTitle="Energy Efficiency Upgrade"
        />
      </div>
    </main>
  );
}
