// src/lib/saveDocumentLinesWithCo2.ts
import { supabase } from "./supabase";
import { ACTIVE_ORG_ID } from "./org";

type ParsedInvoiceLine = {
  description?: string | null;
  quantity?: number | null;
  unit?: string | null; // "kWh", "L", "km", "kg", etc.
  unitPrice?: number | null; // NOK per unit
  amount?: number | null; // line total NOK
};

type ParsedInvoice = {
  vendor?: string | null;
  invoiceNo?: string | null;
  invoiceDate?: string | null; // ISO (YYYY-MM-DD) recommended
  currency?: string | null;
  total?: number | null;
  publicUrl?: string | null;
  status?: string | null; // "processed" etc
  scope?: string | null; // optional
  totalCo2Kg?: number | null;
  lines?: ParsedInvoiceLine[];
};

function normUnit(u?: string | null) {
  if (!u) return null;
  const s = u.trim().toLowerCase();
  if (s === "kwh") return "kWh";
  if (s === "l" || s === "liter" || s === "litre") return "L";
  if (s === "km" || s === "kilometer") return "km";
  if (s === "kg") return "kg";
  if (s === "tonn" || s === "t" || s === "ton") return "t";
  return u.trim();
}

function safeNum(n: any): number | null {
  if (n === null || n === undefined) return null;
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : null;
}

/**
 * Grov, men effektiv kategori-mapping for pilot:
 * - Bruk vendor + linjetekst for å finne category
 * - Returnerer: electricity | fuel | transport | waste | null
 */
function inferCategory(vendor?: string | null, lineDesc?: string | null) {
  const v = (vendor ?? "").toLowerCase();
  const d = (lineDesc ?? "").toLowerCase();
  const text = `${v} ${d}`;

  // Electricity
  if (
    text.includes("strøm") ||
    text.includes("elektr") ||
    text.includes("electric") ||
    text.includes("power") ||
    text.includes("nettlei") ||
    text.includes("kwh")
  ) {
    return "electricity";
  }

  // Fuel
  if (
    text.includes("drivstoff") ||
    text.includes("diesel") ||
    text.includes("bensin") ||
    text.includes("gasoline") ||
    text.includes("fuel") ||
    text.includes("liter") ||
    text.includes(" l ") ||
    v.includes("circle k") ||
    v.includes("esso") ||
    v.includes("shell") ||
    v.includes("st1")
  ) {
    return "fuel";
  }

  // Transport
  if (
    text.includes("frakt") ||
    text.includes("shipping") ||
    text.includes("transport") ||
    text.includes("bring") ||
    text.includes("posten") ||
    text.includes("dhl") ||
    text.includes("fedex") ||
    text.includes("ups") ||
    text.includes("km")
  ) {
    return "transport";
  }

  // Waste
  if (
    text.includes("avfall") ||
    text.includes("waste") ||
    text.includes("gjenvinning") ||
    text.includes("recycle")
  ) {
    return "waste";
  }

  return null;
}

/**
 * Lagrer invoice + lines (med nye felt)
 * Returnerer invoiceId (uuid)
 */
export async function saveDocumentLinesWithCo2(parsed: ParsedInvoice) {
  const vendor = (parsed.vendor ?? "Ukjent").trim() || "Ukjent";

  // 1) Insert invoice
  const invoiceInsert = {
    org_id: ACTIVE_ORG_ID,
    vendor,
    invoice_no: parsed.invoiceNo ?? null,
    invoice_date: parsed.invoiceDate ?? null,
    currency: parsed.currency ?? "NOK",
    total: safeNum(parsed.total) ?? 0,
    total_co2_kg: safeNum(parsed.totalCo2Kg) ?? 0,
    public_url: parsed.publicUrl ?? null,
    status: parsed.status ?? "processed",
    scope: parsed.scope ?? null,
  };

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .insert(invoiceInsert)
    .select("id")
    .single();

  if (invErr) throw invErr;

  const invoiceId: string = inv.id;

  // 2) Insert lines
  const rawLines = parsed.lines ?? [];
  if (rawLines.length > 0) {
    const lineRows = rawLines.map((ln) => {
      const quantity = safeNum(ln.quantity);
      const unit = normUnit(ln.unit);
      const amount = safeNum(ln.amount);

      // unit_price: bruk OCR hvis finnes; ellers regn fra amount/quantity når mulig
      const unitPriceFromOcr = safeNum(ln.unitPrice);
      const computedUnitPrice =
        unitPriceFromOcr ??
        (quantity && quantity > 0 && amount !== null ? amount / quantity : null);

      const category = inferCategory(vendor, ln.description ?? null);

      return {
        invoice_id: invoiceId,
        description: ln.description ?? null,

        // Linjetotal (NB: sørg for at invoice_lines faktisk har kolonnen "total"
        // Hvis dere bruker "line_total" i DB, bytt "total" til "line_total" her
        total: amount ?? 0,

        // nye felt
        category,
        quantity: quantity ?? null,
        unit: unit ?? null,
        unit_price: computedUnitPrice ?? null,
      };
    });

    const { error: lineErr } = await supabase
      .from("invoice_lines")
      .insert(lineRows);

    if (lineErr) throw lineErr;
  }

  return invoiceId;
}
