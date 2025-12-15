// src/lib/saveDocumentLinesWithCo2.ts
import { supabase } from "./supabase";
import { classifyLineItem } from "./classifyLineItem";

type ParsedLine = {
  description?: string | null;
  amount_nok?: number | null;
  co2_kg?: number | null;
  quantity?: number | null;
  unit?: string | null;
};

type SaveArgs = {
  invoice_id: string;
  vendor?: string | null;
  lines: ParsedLine[];
};

function toNum(x: any) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function cleanCategory(c: any) {
  const s = typeof c === "string" ? c.trim() : "";
  return s ? s : "other";
}

/**
 * Lagrer invoice_lines med CO2 + kategori (ALLTID).
 * OBS: Ingen org_id her, siden dere ikke har org_id på invoice_lines.
 */
async function saveDocumentLinesWithCo2(args: SaveArgs) {
  const { invoice_id, vendor, lines } = args;

  if (!invoice_id) throw new Error("saveDocumentLinesWithCo2: missing invoice_id");

  const rows = (lines ?? []).map((l) => {
    const category = classifyLineItem({
      description: l.description ?? "",
      vendor: vendor ?? "",
      unit: l.unit ?? "",
    });

    return {
      invoice_id,
      description: l.description ?? "",
      quantity: l.quantity ?? null,
      unit: l.unit ?? null,
      amount_nok: toNum(l.amount_nok),
      co2_kg: toNum(l.co2_kg),
      category: cleanCategory(category),
    };
  });

  // Unngå duplikater ved re-upload
  const del = await supabase.from("invoice_lines").delete().eq("invoice_id", invoice_id);
  if (del.error) throw del.error;

  if (rows.length === 0) return;

  const ins = await supabase.from("invoice_lines").insert(rows);
  if (ins.error) throw ins.error;
}

export default saveDocumentLinesWithCo2;
