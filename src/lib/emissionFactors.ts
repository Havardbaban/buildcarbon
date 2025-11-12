// src/lib/emissionFactors.ts
// Default factors (approximate, tweak in code or fetch from DB later)
export const EF = {
  GRID_ELECTRICITY_NO_KG_PER_KWH: 0.028, // kg CO2e/kWh (example low-carbon grid)
  DIESEL_KG_PER_L: 2.66,
  GASOLINE_KG_PER_L: 2.31,
  NATURAL_GAS_KG_PER_M3: 2.0,
};

export type EmissionEstimate = {
  co2_kg?: number;
  energy_kwh?: number;
  fuel_liters?: number;
  gas_m3?: number;
  method?: "direct" | "kwh*grid" | "liters*fuel" | "m3*gas";
  notes?: string;
};
