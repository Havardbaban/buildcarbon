// src/lib/classifyLineItem.ts

export type LineCategory =
  | "electricity"
  | "fuel"
  | "transport"
  | "heat"
  | "water"
  | "waste"
  | "office"
  | "it"
  | "food"
  | "other";

export type ClassifyInput = {
  description?: string | null;
  vendor?: string | null;
  unit?: string | null;
};

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w));
}

/**
 * Returnerer ALLTID en kategori.
 * Målet her er stabil drift og “god nok” baseline,
 * ikke perfekt ML-klassifisering.
 */
export function classifyLineItem(input: ClassifyInput): LineCategory {
  const desc = norm(input.description ?? "");
  const vendor = norm(input.vendor ?? "");
  const unit = norm(input.unit ?? "");
  const text = `${desc} ${vendor} ${unit}`.trim();

  if (!text) return "other";

  // Electricity
  if (
    hasAny(text, [
      "strøm",
      "strom",
      "electricity",
      "energi",
      "power",
      "kwh",
      "kilowatt",
      "nettlei",
      "nettleie",
      "elavgift",
      "el-avgift",
      "grid",
      "utility",
    ])
  ) {
    return "electricity";
  }

  // Fuel
  if (
    hasAny(text, [
      "diesel",
      "bensin",
      "gasoline",
      "drivstoff",
      "fuel",
      "adblue",
      "biodiesel",
      "hvo",
      "lading", // ofte elbillading havner her, men hvis kwh -> electricity over styrer
      "charging",
    ])
  ) {
    // hvis kwh er tydelig, prioriter strøm
    if (text.includes("kwh")) return "electricity";
    return "fuel";
  }

  // Transport / Logistics
  if (
    hasAny(text, [
      "frakt",
      "transport",
      "shipping",
      "logistikk",
      "logistics",
      "levering",
      "delivery",
      "bud",
      "courier",
      "spedisjon",
      "freight",
      "dhl",
      "ups",
      "fedex",
      "posten",
      "bring",
      "gls",
      "flyfrakt",
      "sea freight",
      "sjøfrakt",
    ])
  ) {
    return "transport";
  }

  // Heat / district heating
  if (
    hasAny(text, [
      "fjernvarme",
      "district heating",
      "varme",
      "heating",
      "steam",
      "gass",
      "naturgass",
      "propane",
      "lpg",
    ])
  ) {
    // naturgass/propane kan være fuel, men for rapportering skiller vi varme
    return "heat";
  }

  // Water
  if (hasAny(text, ["vann", "water", "avløp", "avlop", "sewage"])) {
    return "water";
  }

  // Waste
  if (hasAny(text, ["avfall", "waste", "restavfall", "gjenvinning", "recycling"])) {
    return "waste";
  }

  // Office / supplies
  if (hasAny(text, ["kontor", "office", "rekvisita", "paper", "papir", "toner"])) {
    return "office";
  }

  // IT / software
  if (hasAny(text, ["software", "saas", "license", "lisens", "cloud", "hosting", "server"])) {
    return "it";
  }

  // Food
  if (hasAny(text, ["mat", "food", "catering", "kantine", "lunsj", "lunch"])) {
    return "food";
  }

  return "other";
}
