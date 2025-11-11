// src/lib/invoiceParser.ts
export type ParsedInvoice = {
  vendor?: string;
  invoiceNumber?: string;
  dateISO?: string;
  total?: number;
  currency?: string;
};

export default async function parseInvoice(text: string): Promise<ParsedInvoice> {
  const out: ParsedInvoice = {};

  const vendorMatch = text.match(/Vendor:\s*(.+)/i);
  if (vendorMatch) out.vendor = vendorMatch[1].trim();

  const numMatch = text.match(/Invoice\s*#?:\s*([A-Z0-9\-]+)/i);
  if (numMatch) out.invoiceNumber = numMatch[1].trim();

  const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\b/);
  if (dateMatch) out.dateISO = dateMatch[1];

  const totalMatch = text.match(/\b(total|amount due)\b[^0-9]*([\d\.,]+)/i);
  if (totalMatch) out.total = Number(totalMatch[2].replace(/[^\d.]/g, ""));

  const currencyMatch = text.match(/\b(NOK|EUR|USD|SEK|DKK)\b/i);
  if (currencyMatch) out.currency = currencyMatch[1].toUpperCase();

  return out;
}
