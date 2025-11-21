import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import processInvoiceUpload from "../src/lib/processInvoiceUpload";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// POST /api/process-invoice
// body: { orgId: string, filePath: string }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const { orgId, filePath } = (req.body || {}) as {
    orgId?: string;
    filePath?: string;
  };

  if (!orgId || !filePath) {
    return res.status(400).json({ error: "Missing orgId or filePath" });
  }

  try {
    // 1) Download file from Supabase Storage (bucket: "invoices")
    const { data: fileData, error: fileErr } = await supabase.storage
      .from("invoices")
      .download(filePath);

    if (fileErr || !fileData) {
      console.error("storage download error", fileErr);
      return res.status(500).json({ error: "Could not download file" });
    }

    const buffer = await toBuffer(fileData);

    // 2) Extract text from PDF
    const text = await extractTextFromPDF(buffer);

    // 3) Use your existing pipeline to parse + save + calculate CO2
    const result = await processInvoiceUpload({
      supabase,
      orgId,
      invoiceText: text,
      lines: [], // still no separate line items here
    });

    return res.status(200).json({ ok: true, result });
  } catch (e: any) {
    console.error("PROCESS ERROR:", e);
    return res
      .status(500)
      .json({ error: e?.message ?? "Unexpected processing error" });
  }
}

// ------------- helpers -------------

async function toBuffer(data: any): Promise<Buffer> {
  // Node stream from Supabase
  const chunks: Uint8Array[] = [];
  for await (const chunk of data as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text || "";
}
