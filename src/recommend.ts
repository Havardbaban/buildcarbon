import measuresRaw from "./measures.json";
import type { EnvestoInputs } from "./EnvestoReport";

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

type Measure = {
  id: string;
  category: string;
  title: string;
  trigger: string;
  desc: string;
  default_capex: number;
  lifetime_years: number;
  save_pct_of_energy_spend: number;
};

const ASSUMPTIONS = {
  discountRate: 0.08,
  energyPriceNOKperKWh: 1.2,
  gridEmissionFactorKgPerKWh: 0.17,
};

function npv(rate: number, cash: number[]) {
  return cash.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);
}

export function recommendMeasures(inputs: EnvestoInputs): Recommendation[] {
  const measures = measuresRaw as Measure[];
  const recs: Recommendation[] = [];

  for (const m of measures) {
    const annual_nok_save = inputs.energySpend * m.save_pct_of_energy_spend;
    const annual_kwh_save = annual_nok_save / ASSUMPTIONS.energyPriceNOKperKWh;
    const annual_co2e_save_kg = annual_kwh_save * ASSUMPTIONS.gridEmissionFactorKgPerKWh;

    const capex = m.default_capex;
    const cash: number[] = [-capex];
    for (let y = 1; y <= m.lifetime_years; y++) cash.push(annual_nok_save);
    const measureNpv = npv(ASSUMPTIONS.discountRate, cash);
    const payback_years = annual_nok_save > 0 ? Math.round((capex / annual_nok_save) * 10) / 10 : null;

    recs.push({
      id: m.id,
      title: m.title,
      category: m.category,
      trigger: m.trigger,
      desc: m.desc,
      capex,
      lifetime_years: m.lifetime_years,
      annual_nok_save,
      annual_kwh_save,
      annual_co2e_save_kg,
      payback_years,
      npv: measureNpv,
    });
  }

  recs.sort((a, b) => (a.payback_years ?? 999) - (b.payback_years ?? 999) || b.npv - a.npv);
  return recs;
}
