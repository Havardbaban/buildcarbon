// src/lib/saveDocumentLinesWithCo2.ts
import { supabase } from "./supabase";
import { ACTIVE_ORG_ID } from "./org";

export type SaveLine = {
  description?: string | null;
  category?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  line_total?: number | null;
  total?: number | null;
};

export type SaveInvoiceArgs = {
  vendor: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  currency: string | null;

  amount_nok: number;
  total_co2_kg: number;

  public_url?: string | null;
  status?: string | null;
  scope?: string | null;

  lines?: SaveLine[];
};

function n(x: any): number | null {
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : null;
}

/**
 * ✅ Default export (matches: import saveDocumentLinesWithCo2 from "./saveDocumentLinesWithCo2")
 */
export default async function saveDocumentLinesWithCo2(args: SaveInvoiceArgs) {
  // 1) Insert invoice
  const invoicePayload: any = {
    org_id: ACTIVE_ORG_ID,
    vendor: args.vendor ?? null,
    invoice_no: args.invoice_no ?? null,
    invoice_date: args.invoice_date ?? null,
    currency: args.currency ?? "NOK",
    amount_nok: n(args.amount_nok) ?? 0,
    total_co2_kg: n(args.total_co2_kg) ?? 0,
    public_url: args.public_url ?? null,
    status: args.status ?? "ok",
    scope: args.scope ?? "Scope 3",
  };

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert(invoicePayload)
    .select("id")
    .single();

  if (invErr) throw invErr;

  const invoiceId = invoice.id as string;

  // 2) Insert invoice_lines (optional)
  const lines = args.lines ?? [];
  if (lines.length > 0) {
    const linePayload = lines.map((l) => ({
      invoice_id: invoiceId,
      description: l.description ?? null,
      category: l.category ?? null,
      quantity: n(l.quantity),
      unit: l.unit ?? null,
      unit_price: n(l.unit_price),
      line_total: n(l.line_total ?? l.total),
    }));

    const { error: lineErr } = await supabase.from("invoice_lines").insert(linePayload);
    if (lineErr) throw lineErr;
  }

  return { invoiceId };
}

/**
 * Optional named export with a DIFFERENT name (no collision)
 * Use only if you need it somewhere:
 * import { saveDocumentLinesWithCo2Named } from "./saveDocumentLinesWithCo2";
 */
export const saveDocumentLinesWithCo2Named = saveDocumentLinesWithCo2;
