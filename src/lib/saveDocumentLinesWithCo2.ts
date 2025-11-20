// src/lib/saveDocumentLinesWithCo2.ts
// Temporary stub: we only keep types and an empty function so imports work,
// but we don't actually write any document_line rows yet.

export type RawInvoiceLine = {
  description: string | null;
  quantity: number | null;
  unitRaw?: string | null;
  amountNok?: number | null;
};

export async function saveDocumentLinesWithCo2(
  supabase: any,
  documentId: string,
  lines: RawInvoiceLine[]
): Promise<void> {
  // NO-OP for now: we are not inserting into document_line until
  // the schema is fully cleaned up.
  console.log("saveDocumentLinesWithCo2 called (stub). documentId:", documentId);
}
