import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // must be service role for writing lines
  { auth: { persistSession: false } }
);

// ------------------------------
// MAIN HANDLER
// ------------------------------
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Missing invoice id" });
  }

  try {
    // 1. Get invoice record
    const { data: invoice, error: invoiceErr } = await supabase
      .from("invoice")
      .select("*")
      .eq("id", id)
      .single();

    if (invoiceErr || !invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // 2. Download file from Supabase Storage
    const { data: fileData, error: fileErr } = await supabase.storage
      .from("invoices")
      .download(invoice.file_path);

    if (fileErr || !fileData) {
      return res.status(500).json({ error: "Could not download file" });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Extract text from PDF
    const text = await extractTextFromPDF(buffer);

    // 4. Parse data (VERY SIMPLE REGEX VERSION — replace later)
    const parsed = simpleParseInvoice(text);

    // 5. Insert invoice line (single dummy line for now)
    await supabase.from("invoice_line").insert({
      invoice_id: id,
      description: parsed.description || "General expense",
      quantity: 1,
      unit_price: parsed.total || 0,
      total: parsed.total || 0,
      activity_type: parsed.activity_type,
      unit: parsed.unit,
      activity_amount: parsed.amount,
      emission_factor: parsed.emission_factor,
      co2e: (parsed.amount ?? 0) * (parsed.emission_factor ?? 0)
    });

    // 6. Calculate totals
    const co2e_total =
      (parsed.amount ?? 0) * (parsed.emission_factor ?? 0);

    // 7. Update invoice record
    await supabase
      .from("invoice")
      .update({
        vendor: parsed.vendor,
        invoice_no: parsed.invoice_no,
        invoice_date: parsed.invoice_date,
        total: parsed.total,
        currency: "NOK",
        co2e_total,
        status: "processed"
      })
      .eq("id", id);

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("PROCESS ERROR:", e);
    return res.status(500).json({ error: e.message });
  }
}

// ------------------------------
// PDF TEXT EXTRACTION
// ------------------------------
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text || "";
}

// ------------------------------
// VERY SIMPLE PARSER
// ------------------------------
function simpleParseInvoice(text: string) {
  // Dummy regex logic — replace later when you want more accuracy
  const vendorMatch = text.match(/(Firmanavn|Vendor|Leverandør):?\s*(.+)/i);
  const invoiceNoMatch = text.match(/Invoice\s*No\.?:?\s*(\S+)/i);
  const totalMatch = text.match(/Total\s*:?[\s\n]*([\d,.]+)/i);

  return {
    vendor: vendorMatch?.[2] || "Unknown vendor",
    invoice_no: invoiceNoMatch?.[1] || "N/A",
    invoice_date: new Date().toISOString().slice(0, 10),
    total: parseFloat(totalMatch?.[1]?.replace(",", ".") || "0"),

    // CO₂ example fields
    description: "Detected expense",
    amount: 1, // activity amount
    unit: "unit",
    activity_type: "general",
    emission_factor: 0.2 // default simple EF
  };
}
