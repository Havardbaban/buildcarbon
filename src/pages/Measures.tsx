// src/pages/Measures.tsx

import { useEffect, useState } from "react";
import supabase from "../lib/supabase";

type DocumentRow = {
  id: string;
  org_id: string;
  issue_date: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
  fuel_liters: number | null;
};

type MeasureStatus = "proposed" | "approved" | "implemented" | "verified";

type Measure = {
  id: string;
  title: string;
  category: string;
  description: string;
  document_id: string | null;

  annual_nok_save: number;
  annual_co2_save: number;
  annual_fuel_save_liters: number;

  capex: number;
  lifetime_years: number;
  npv: number;
  payback_years: number | null;

  status: MeasureStatus;
  trigger: string;
};

const DISCOUNT_RATE = 0.08; // 8% – you can tweak later

function calcNPV(
  annualCashflow: number,
  years: number,
  discountRate: number
): number {
  if (annualCashflow === 0 || years <= 0) return 0;
  let npv = 0;
  for (let t = 1; t <= years; t++) {
    npv += annualCashflow / Math.pow(1 + discountRate, t);
  }
  return npv;
}

function formatMoney(value: number): string {
  if (!isFinite(value)) return "—";
  return value.toLocaleString("nb-NO", {
    maximumFractionDigits: 0,
  });
}

function formatCo2(value: number): string {
  if (!isFinite(value)) return "—";
  return value.toLocaleString("nb-NO", {
    maximumFractionDigits: 1,
  });
}

function formatYears(value: number | null): string {
  if (value == null || !isFinite(value)) return "—";
  return value.toLocaleString("nb-NO", {
    maximumFractionDigits: 1,
  });
}

/**
 * Simple rules engine:
 * - For each fuel-heavy invoice (fuel_liters > 0), suggest a "fuel efficiency" measure
 * - For each high-CO2 invoice (co2_kg > threshold), suggest an "optimization pack"
 *
 * This is just MVP logic you can extend later.
 */
function generateMeasuresFromDocuments(docs: DocumentRow[]): Measure[] {
  const measures: Measure[] = [];

  docs.forEach((doc, index) => {
    const baseNok = doc.total_amount ?? 0;
    const baseCo2 = doc.co2_kg ?? 0;
    const baseFuel = doc.fuel_liters ?? 0;

    // Rule 1: Fuel efficiency campaign for fuel invoices
    if (baseFuel > 0 && baseCo2 > 0) {
      const annualNokSave = baseNok * 0.1; // 10% saving assumption
      const annualCo2Save = baseCo2 * 0.1;
      const annualFuelSave = baseFuel * 0.1;
      const capex = 50_000; // e.g. telematics, driver training, routing tools
      const lifetimeYears = 5;

      const npvGross = calcNPV(annualNokSave, lifetimeYears, DISCOUNT_RATE);
      const npv = npvGross - capex;
      const payback =
        annualNokSave > 0 ? capex / annualNokSave : null;

      measures.push({
        id: `fuel-efficiency-${doc.id}`,
        title: "Fuel efficiency program",
        category: "Fleet / Transport",
        description:
          "Reduce diesel use through routing optimization, driver training, and telematics. Assumed 10% reduction of current fuel use.",
        document_id: doc.id,
        annual_nok_save: annualNokSave,
        annual_co2_save: annualCo2Save,
        annual_fuel_save_liters: annualFuelSave,
        capex,
        lifetime_years: lifetimeYears,
        npv,
        payback_years: payback,
        status: "proposed",
        trigger: "High fuel consumption detected in invoices",
      });
    }

    // Rule 2: High CO₂ invoice → generic optimization measure
    if (baseCo2 > 250) {
      const annualNokSave = baseNok * 0.05; // 5% saving
      const annualCo2Save = baseCo2 * 0.05;
      const capex = 30_000;
      const lifetimeYears = 4;

      const npvGross = calcNPV(annualNokSave, lifetimeYears, DISCOUNT_RATE);
      const npv = npvGross - capex;
      const payback =
        annualNokSave > 0 ? capex / annualNokSave : null;

      measures.push({
        id: `optimization-${index}-${doc.id}`,
        title: "Operational optimization pack",
        category: "Operations",
        description:
          "Process and operational optimization to lower energy consumption and CO₂. Assumed 5% reduction of current spend and emissions.",
        document_id: doc.id,
        annual_nok_save: annualNokSave,
        annual_co2_save: annualCo2Save,
        annual_fuel_save_liters: 0,
        capex,
        lifetime_years: lifetimeYears,
        npv,
        payback_years: payback,
        status: "proposed",
        trigger: "High CO₂ intensity in selected invoices",
      });
    }
  });

  return measures;
}

export default function MeasuresPage() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("document")
        .select("*");

      if (error) {
        console.error("Error loading documents:", error);
        setError(error.message ?? "Unknown error");
        setDocs([]);
        setMeasures([]);
      } else {
        const docsData = (data || []) as DocumentRow[];
        setDocs(docsData);
        setMeasures(generateMeasuresFromDocuments(docsData));
      }

      setLoading(false);
    };

    load();
  }, []);

  const totalMeasures = measures.length;
  const totalAnnualNok = measures.reduce(
    (sum, m) => sum + m.annual_nok_save,
    0
  );
  const totalAnnualCo2 = measures.reduce(
    (sum, m) => sum + m.annual_co2_save,
    0
  );
  const totalNPV = measures.reduce((sum, m) => sum + m.npv, 0);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Measures &amp; Savings</h1>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Error: {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Measures
          </p>
          <p className="mt-3 text-2xl font-bold">{totalMeasures}</p>
          <p className="mt-1 text-xs text-slate-500">
            Automatically generated from invoices
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Annual savings (NOK)
          </p>
          <p className="mt-3 text-2xl font-bold">
            {formatMoney(totalAnnualNok)} NOK
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Sum of all proposed measures
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Annual CO₂ reduction
          </p>
          <p className="mt-3 text-2xl font-bold">
            {formatCo2(totalAnnualCo2)} kg
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Approximate, based on simple rules
          </p>
        </div>
      </div>

      {/* NPV summary card */}
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 mb-6">
        <p className="font-semibold">
          Estimated total NPV: {formatMoney(totalNPV)} NOK
        </p>
        <p className="text-xs mt-1">
          Calculated with 8% discount rate and capex assumptions per measure.
        </p>
      </div>

      {/* Measures table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Measure
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Category
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Annual NOK
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Annual CO₂ (kg)
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Capex (NOK)
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Payback (yrs)
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                NPV (NOK)
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-slate-500"
                >
                  Running rules and calculating measures…
                </td>
              </tr>
            )}

            {!loading && measures.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-slate-500"
                >
                  No measures proposed yet. Add some invoices with fuel/CO₂ to
                  generate opportunities.
                </td>
              </tr>
            )}

            {!loading &&
              measures.map((m) => (
                <tr
                  key={m.id}
                  className="border-t border-gray-200 align-top"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {m.title}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {m.description}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Trigger: {m.trigger}
                      {m.document_id && (
                        <> • From invoice {m.document_id.slice(0, 8)}…</>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {m.category}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(m.annual_nok_save)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCo2(m.annual_co2_save)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(m.capex)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatYears(m.payback_years)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(m.npv)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-600">
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
