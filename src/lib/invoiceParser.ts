// src/lib/invoiceParser.ts
export type ParsedInvoice = {
  vendor?: string;
  invoiceNumber?: string;
  date?: string;
  total?: number;
  currency?: string;
  // add fields you actually use
};

export default async function parseInvoice(file: File): Promise<ParsedInvoice> {
  // TODO: your real logic; keep a stub so the build passes
  return {};
}
