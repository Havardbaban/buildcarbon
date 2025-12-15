// src/lib/parseInvoiceLines.ts

export type ParsedInvoiceLine = {
  description: string;
  category: "electricity" | "fuel" | "transport" | "waste" | "other";
  quantity: number | null;
  unit: "kWh" | "L" | "km" | "kg" | null;
  unit_price: number | null; // NOK per unit (if known)
  line_total: number | null; // NOK (if known)
};

function toNumber(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string") {
    const s = x
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normUnit(u: string | null | undefined): ParsedInvoiceLine["unit"] {
  if (!u) return null;
  const s = u.trim().toLowerCase();
  if (s === "kwh") return "kWh";
  if (s === "l" || s === "liter" || s === "litre") return "L";
  if (s === "km" || s === "kilometer") return "km";
  if (s === "kg") return "kg";
  return null;
}

function detectCategory(desc: string): ParsedInvoiceLine["category"] {
  const d = desc.toLowerCase();

  // Electricity
  if (/(kwh|nettlei|strøm|kraft|elavgift|energi)/i.test(d)) return "electricity";

  // Fuel
  if (/(diesel|bensin|drivstoff|fuel|liter\b|l\b)/i.test(d)) return "fuel";

  // Transport
  if (/(frakt|transport|shipping|levering|km\b|kilometer|toll|speditør)/i.test(d))
    return "transport";

  // Waste
  if (/(avfall|waste|restavfall|gjenvinning|container|kg\b)/i.test(d)) return "waste";

  return "other";
}

// Heuristic: extract quantity + unit from description if Azure doesn't provide it
function extractQtyUnitFromText(desc: string): { quantity: number | null; unit: ParsedInvoiceLine["unit"] } {
  const s = desc.toLowerCase();

  // kWh
  let m = s.match(/(\d+(?:[.,]\d+)?)\s*(kwh)\b/i);
  if (m) return { quantity: toNumber(m[1]), unit: "kWh" };

  // liters
  m = s.match(/(\d+(?:[.,]\d+)?)\s*(l|liter|litre)\b/i);
  if (m) return { quantity: toNumber(m[1]), unit: "L" };

  // km
  m = s.match(/(\d+(?:[.,]\d+)?)\s*(km|kilometer)\b/i);
  if (m) return { quantity: toNumber(m[1]), unit: "km" };

  // kg
  m = s.match(/(\d+(?:[.,]\d+)?)\s*(kg)\b/i);
  if (m) return { quantity: toNumber(m[1]), unit: "kg" };

  return { quantity: null, unit: null };
}

/**
 * Accepts Azure DI "prebuilt-invoice" response OR any object that contains
 * a lineItems-ish array. We keep this flexible because you might have variations.
 */
export function parseInvoiceLines(azure: any): ParsedInvoiceLine[] {
  // Typical Azure structure:
  // azure.documents[0].fields.Items.values -> array of items
  const items =
    azure?.documents?.[0]?.fields?.Items?.values ??
    azure?.documents?.[0]?.fields?.Items?.value ??
    azure?.lineItems ??
    azure?.items ??
    [];

  if (!Array.isArray(items)) return [];

  const parsed: ParsedInvoiceLine[] = [];

  for (const it of items) {
    // Azure fields often sit under it.properties / it.value / it.fields
    const f = it?.properties ?? it?.fields ?? it?.value ?? it ?? {};

    const desc =
      (f?.Description?.content ??
        f?.Description?.value ??
        f?.description ??
        f?.ItemDescription?.content ??
        f?.ItemDescription?.value ??
        "") + "";

    const description = desc.trim() || "Line";

    const qty =
      toNumber(f?.Quantity?.value ?? f?.Quantity?.content ?? f?.quantity) ??
      null;

    const unit =
      normUnit(f?.Unit?.value ?? f?.Unit?.content ?? f?.unit) ?? null;

    const unitPrice =
      toNumber(f?.UnitPrice?.value?.amount ?? f?.UnitPrice?.value ?? f?.unitPrice) ??
      null;

    const amount =
      toNumber(f?.Amount?.value?.amount ?? f?.Amount?.value ?? f?.amount) ??
      toNumber(f?.LineTotal?.value?.amount ?? f?.LineTotal?.value ?? f?.lineTotal) ??
      null;

    // fallback: extract qty/unit from text if missing
    const extracted = extractQtyUnitFromText(description);

    const finalQty = qty ?? extracted.quantity;
    const finalUnit = unit ?? extracted.unit;

    // if line_total missing but we have qty+unit_price -> compute
    const computedLineTotal =
      amount ??
      (finalQty != null && unitPrice != null ? finalQty * unitPrice : null);

    parsed.push({
      description,
      category: detectCategory(description),
      quantity: finalQty,
      unit: finalUnit,
      unit_price: unitPrice,
      line_total: computedLineTotal,
    });
  }

  // remove empty garbage lines
  return parsed.filter((l) => l.description.length > 0);
}
