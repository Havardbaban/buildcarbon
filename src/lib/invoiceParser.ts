// src/lib/invoiceParser.ts

export type ParsedInvoice = {
  vendor?: string;
  invoiceNumber?: string;
  dateISO?: string;
  total?: number;
  currency?: string;
  orgNumber?: string;

  // quantities we can sometimes read:
  energy_kwh?: number;   // electricity or district heat
  fuel_liters?: number;  // diesel/petrol
  gas_m3?: number;       // natural gas
  co2_kg?: number;       // rough estimate from factors below
};

// ---- helpers --------------------------------------------------

function cleanNumber(s: string): number | undefined {
  // handle "12 345,67" and "12,345.67"
  const x = s.replace(/\s/g, "").replace(/(\d)[.,](?=\d{3}\b)/g, "$1"); // drop thousands sep
  const normalized = x.replace(",", "."); // decimal point
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function first<T>(...vals: Array<T | undefined | null>): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null && `${v}`.trim() !== "") return v as T;
  return undefined;
}

// crude factors (kg CO2e / unit). Adjust later to your official set.
const EF = {
  electricity_kwh: 0.02,     // Norway grid very low; tune later
  district_heat_kwh: 0.18,   // placeholder
  diesel_l: 2.66,
  petrol_l: 2.31,
  natural_gas_m3: 2.00,
};

// ---- main -----------------------------------------------------

export default async function parseInvoice(text: string): Promise<ParsedInvoice> {
  const out: ParsedInvoice = {};
  const t = text.replace(/\r/g, "");

  // Currency
  const currencyMatch = t.match(/\b(NOK|EUR|USD|SEK|DKK)\b/i);
  out.currency = currencyMatch ? currencyMatch[1].toUpperCase() : "NOK";

  // Date (YYYY-MM-DD or DD.MM.YYYY or DD/MM/YYYY)
  const dateISO =
    t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)?.[0] ??
    (() => {
      const m = t.match(/\b(\d{2})[./](\d{2})[./](\d{4})\b/);
      if (!m) return undefined;
      const [_, dd, mm, yyyy] = m;
      return `${yyyy}-${mm}-${dd}`;
    })();
  if (dateISO) out.dateISO = dateISO;

  // Invoice number
  const invNum =
    t.match(/Invoice\s*(?:No|Number|#)[:\s]*([A-Z0-9\-]+)/i)?.[1] ??
    t.match(/Faktura\s*(?:nr|nummer|#)[:\s]*([A-Z0-9\-]+)/i)?.[1];
  if (invNum) out.invoiceNumber = invNum.trim();

  // Vendor (very heuristic): “Faktura fra X”, “Invoice from X”, or first line caps
  const vendor =
    t.match(/(?:Faktura|Invoice)\s+(?:fra|from)\s+([^\n\r]+)/i)?.[1] ??
    t.split("\n").map(s => s.trim()).find(s => /^[A-ZÆØÅA-Z0-9 .,&'()/-]{3,}$/.test(s));
  if (vendor) out.vendor = vendor.replace(/\s{2,}/g, " ").trim();

  // Org.nr
  const orgMatch = t.match(/Org\.?\s*nr\.?\s*[:\-]?\s*([\d\s]{7,})/i);
  if (orgMatch) out.orgNumber = orgMatch[1].replace(/\s/g, "");

  // Total
  const totalMatch =
    t.match(/\b(Total(?:t)?|Amount\s*Due|Å\s*betale|Sum)\b[^\d\-]*([\d\s.,]+)\b/iu)?.[2] ??
    t.match(/\bBetales\s*([0-9\s.,]+)\b/i)?.[1];
  const total = totalMatch ? cleanNumber(totalMatch) : undefined;
  if (total !== undefined) out.total = total;

  // Quantities we can sometimes read
  // Electricity / heat (kWh / MWh)
  const energy = (() => {
    const m = t.match(/([\d\s.,]+)\s*(kwh|mwh)\b/i);
    if (!m) return undefined;
    const n = cleanNumber(m[1]);
    if (n === undefined) return undefined;
    return m[2].toLowerCase() === "mwh" ? n * 1000 : n;
  })();
  if (energy !== undefined) out.energy_kwh = energy;

  // Fuel liters (diesel/petrol)
  const fuelLiters = (() => {
    const m = t.match(/([\d\s.,]+)\s*(?:liter|l)\b.*\b(diesel|bensin|petrol|gasoline)?/i);
    if (!m) return undefined;
    const n = cleanNumber(m[1]);
    return n;
  })();
  if (fuelLiters !== undefined) out.fuel_liters = fuelLiters;

  // Gas m3
  const gasM3 = (() => {
    const m = t.match(/([\d\s.,]+)\s*(?:sm3|nm3|m3)\b.*\b(gass|gas)\b/i);
    if (!m) return undefined;
    const n = cleanNumber(m[1]);
    return n;
  })();
  if (gasM3 !== undefined) out.gas_m3 = gasM3;

  // CO2 estimate
  let co2 = 0;
  if (out.energy_kwh !== undefined) {
    // try to detect district heating keywords
    const isHeat = /fjernvarme|district\s*heat/i.test(t);
    co2 += out.energy_kwh * (isHeat ? EF.district_heat_kwh : EF.electricity_kwh);
  }
  if (out.fuel_liters !== undefined) {
    // rough: if "diesel" present, use diesel factor; else petrol as fallback
    const isDiesel = /\bdiesel\b/i.test(t);
    co2 += out.fuel_liters * (isDiesel ? EF.diesel_l : EF.petrol_l);
  }
  if (out.gas_m3 !== undefined) co2 += out.gas_m3 * EF.natural_gas_m3;

  if (co2 > 0) out.co2_kg = Math.round(co2 * 1000) / 1000; // 3 decimals

  return out;
}
