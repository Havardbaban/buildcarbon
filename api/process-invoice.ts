import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// ------------------------------
// Main handler
// ------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      .download(invoice.file_path); // make sure column name matches

    if (fileErr || !fileData) {
      console.error(fileErr);
      return res.status(500).json({ error: "Could not download file" });
    }

    const buffer = await toBuffer(fileData);

    // 3. Extract text from PDF
    const text = await extractTextFromPDF(buffer);

    // 4. Parse the invoice text (very simple placeholder parser)
    const parsed = simpleParseInvoice(text);

    // 5. Insert one invoice_line (you can expand this later)
    const lineCo2 =
      (parsed.amount ?? 0) * (parsed.emission_factor ?? 0);

    const { error: lineErr } = await supabase.from("invoice_line").insert({
      invoice_id: id,
      description: parsed.description || "General expense",
      quantity: 1,
      unit_price: parsed.total || 0,
      total: parsed.total || 0,
      activity_type: parsed.activity_type,
      unit: parsed.unit,
      activity_amount: parsed.amount,
      emission_factor: parsed.emission_factor,
      co2e: lineCo2,
    });

    if (lineErr) {
      console.error("invoice_line insert error:", lineErr);
    }

    // 6. Calculate totals for invoice (for now only from this one line)
    const co2e_total = lineCo2;

    // 7. Update invoice record
    const { error: updateErr } = await supabase
      .from("invoice")
      .update({
        vendor: parsed.vendor,
        invoice_no: parsed.invoice_no,
        invoice_date: parsed.invoice_date,
        total: parsed.total,
        currency: "NOK",
        co2e_total,
        status: "processed",
      })
      .eq("id", id);

    if (updateErr) {
      console.error("invoice update error:", updateErr);
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("PROCESS ERROR:", e);
    return res.status(500).json({ error: e?.message ?? "Unknown error" });
  }
}

// ------------------------------
// Helpers
// ------------------------------

async function toBuffer(data: any): Promise<Buffer> {
  // Browser Blob case (just in case)
  if (data && typeof data.arrayBuffer === "function") {
    const ab = await data.arrayBuffer();
    return Buffer.from(ab);
  }

  // Node stream case (what Supabase returns in Vercel)
  const chunks: Uint8Array[] = [];
  for await (const chunk of data as any) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }
  return Buffer.concat(
    chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))
  );
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text || "";
}

// Very simple placeholder parser – improve later
function simpleParseInvoice(text: string) {
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
    emission_factor: 0.2, // default emission factor
  };
}
