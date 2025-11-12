// src/lib/estimateEmissions.ts
import { EF, EmissionEstimate } from "./emissionFactors";

type Inputs = {
  text: string;                    // full OCR text (normalized)
  parsed: {
    co2Kg?: number;
    energyKwh?: number;
    fuelLiters?: number;
    gasM3?: number;
  };
};

export default function estimateEmissions({ text, parsed }: Inputs): EmissionEstimate {
  const t = text.toLowerCase();
  const out: EmissionEstimate = {};

  // 1) If the invoice states CO2 directly, use that
  if (parsed.co2Kg && parsed.co2Kg > 0) {
    out.co2_kg = round2(parsed.co2Kg);
    out.method = "direct";
    return out;
  }

  // 2) Electricity (kWh × grid factor)
  if (parsed.energyKwh && parsed.energyKwh > 0) {
    out.energy_kwh = round2(parsed.energyKwh);
    out.co2_kg = round2(parsed.energyKwh * EF.GRID_ELECTRICITY_NO_KG_PER_KWH);
    out.method = "kwh*grid";
    out.notes = "grid factor configurable";
    return out;
  }

  // 3) Fuel liters × factor (try to infer diesel vs gasoline from text)
  if (parsed.fuelLiters && parsed.fuelLiters > 0) {
    const isDiesel = /diesel/i.test(t);
    const factor = isDiesel ? EF.DIESEL_KG_PER_L : EF.GASOLINE_KG_PER_L;
    out.fuel_liters = round2(parsed.fuelLiters);
    out.co2_kg = round2(parsed.fuelLiters * factor);
    out.method = "liters*fuel";
    out.notes = isDiesel ? "diesel factor" : "gasoline factor";
    return out;
  }

  // 4) Gas m3 × factor
  if (parsed.gasM3 && parsed.gasM3 > 0) {
    out.gas_m3 = round2(parsed.gasM3);
    out.co2_kg = round2(parsed.gasM3 * EF.NATURAL_GAS_KG_PER_M3);
    out.method = "m3*gas";
    return out;
  }

  // 5) No safe estimate
  return out;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
