// src/lib/saveDocumentLinesWithCo2.ts
import { supabase } from "./supabase";
import { ACTIVE_ORG_ID } from "./org";
import type { ParsedInvoiceLine } from "./parseInvoiceLines";

export type SaveInvoiceInput = {
  vendor: string | null;
  invoice_no: string | null;
  invoice_date: string | null; // keep as string (you already use it)
  currency: string | null;

  amount_nok: number; // total cost in NOK (what ESG uses)
  total_co2_kg: number; // invoice total co2

  public_url?: string | null;
  status?: string | null;

  lines: ParsedInvoiceLine[];
};

function safeNum(n: any): number | null {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? x : null;
}

export async function saveDocumentLinesWithCo2(input: SaveInvoiceInput) {
  // 1) Insert invoice
  const invoicePayload: any = {
    org_id: ACTIVE_ORG_ID,
    vendor: input.vendor ?? null,
    invoice_no: input.invoice_no ?? null,
    invoice_date: input.invoice_date ?? null,
    currency: input.currency ?? "NOK",
    amount_nok: input.amount_nok ?? 0,
    total_co2_kg: input.total_co2_kg ?? 0,
    public_url: input.public_url ?? null,
    status: input.status ?? "ok",
    scope: "Scope 3",
  };

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .insert(invoicePayload)
    .select("id")
    .single();

  if (invErr) throw invErr;
  const invoiceId = inv.id as string;

  // 2) Insert invoice_lines (with activity-based fields)
  if (input.lines?.length) {
    const linesPayload = input.lines.map((l) => ({
      invoice_id: invoiceId,
      description: l.description,
      category: l.category,
      quantity: safeNum(l.quantity),
      unit: l.unit,
      unit_price: safeNum(l.unit_price),
      line_total: safeNum(l.line_total),
    }));

    const { error: lineErr } = await supabase.from("invoice_lines").insert(linesPayload);
    if (lineErr) throw lineErr;
  }

  return { invoiceId };
}
