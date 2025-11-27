// src/lib/actionEnrichment.ts

export type DocumentCategory =
  | "electricity"
  | "fuel"
  | "waste"
  | "building"
  | "transport"
  | "other";

type BaseDoc = {
  vendor_name: string | null;
  total_amount: number | null;
  co2_kg: number | null;
};

type EnrichedDocFields = {
  category: DocumentCategory;
  co2_factor: number | null;
  benchmark_cost: number | null;
  potential_savings_nok: number | null;
  potential_savings_co2: number | null;
};

/**
 * Enkel heuristikk for å gjette kategori basert på leverandørnavn.
 * Juster listen etterhvert som du ser faktiske leverandører hos kundene.
 */
export function inferCategory(vendorRaw: string | null): DocumentCategory {
  const vendor = (vendorRaw || "").toLowerCase();

  if (
    vendor.includes("hafslund") ||
    vendor.includes("tibber") ||
    vendor.includes("lyse") ||
    vendor.includes("nordic power") ||
    vendor.includes("fortum") ||
    vendor.includes("elvia")
  ) {
    return "electricity";
  }

  if (
    vendor.includes("circle k") ||
    vendor.includes("st1") ||
    vendor.includes("esso") ||
    vendor.includes("shell") ||
    vendor.includes("yxx") ||
    vendor.includes("bunker") ||
    vendor.includes("drivstoff")
  ) {
    return "fuel";
  }

  if (
    vendor.includes("renovasjon") ||
    vendor.includes("avfall") ||
    vendor.includes("norsirk") ||
    vendor.includes("ragn-sells") ||
    vendor.includes("bingsa")
  ) {
    return "waste";
  }

  if (
    vendor.includes("heimstaden") ||
    vendor.includes("obos") ||
    vendor.includes("selvaag") ||
    vendor.includes("gårdeier") ||
    vendor.includes("gård") ||
    vendor.includes("eiendom") ||
    vendor.includes("bygg")
  ) {
    return "building";
  }

  if (
    vendor.includes("posten") ||
    vendor.includes("bring") ||
    vendor.includes("dhl") ||
    vendor.includes("postnord") ||
    vendor.includes("logistikk") ||
    vendor.includes("transport")
  ) {
    return "transport";
  }

  return "other";
}

/**
 * Enkle default-satser for hvor mye man kan spare, per kategori.
 * Dette er "antatt mulig reduksjon" uten å love noe – fint for MVP/demo.
 *
 * Tolkning: kunden kan typisk spare X % av nåværende kost pr år.
 */
const DEFAULT_SAVING_RATE: Record<DocumentCategory, number> = {
  electricity: 0.15, // 15%
  fuel: 0.10,        // 10%
  waste: 0.12,       // 12%
  building: 0.08,    // 8%
  transport: 0.10,   // 10%
  other: 0.05,       // 5%
};

/**
 * Grovt anslag på CO2-faktor hvis den ikke er satt fra før.
 * (kg CO2 per NOK – kun for MVP/demo, kan senere byttes til ekte faktorer.)
 */
const FALLBACK_CO2_PER_NOK: Record<DocumentCategory, number> = {
  electricity: 0.0002, // svært lav, norsk strøm
  fuel: 0.0025,
  waste: 0.0010,
  building: 0.0008,
  transport: 0.0015,
  other: 0.0005,
};

/**
 * Beriker et dokument med tiltaksdata.
 * Antagelse: faktura ~ månedlig → vi ganger opp til årlig potensial.
 */
export function enrichWithActionData(base: BaseDoc): EnrichedDocFields {
  const category = inferCategory(base.vendor_name);

  const total = base.total_amount || 0;
  const savingRate = DEFAULT_SAVING_RATE[category];

  // Antatt månedlig faktura → årlig.
  const monthlySavingsNok = total * savingRate;
  const annualSavingsNok = monthlySavingsNok * 12;

  const benchmarkCost = total - monthlySavingsNok; // "normalt" nivå hvis man optimaliserer

  const co2Factor =
    base.co2_kg && total > 0 ? base.co2_kg / total : FALLBACK_CO2_PER_NOK[category];

  const annualSavingsCo2 = base.co2_kg
    ? base.co2_kg * savingRate * 12
    : total * co2Factor * savingRate * 12;

  return {
    category,
    co2_factor: co2Factor,
    benchmark_cost: benchmarkCost,
    potential_savings_nok: isFinite(annualSavingsNok) ? annualSavingsNok : null,
    potential_savings_co2: isFinite(annualSavingsCo2) ? annualSavingsCo2 : null,
  };
}
