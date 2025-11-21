import { createClient } from "@supabase/supabase-js";
import { processInvoiceUpload } from "../src/lib/processInvoiceUpload";
import pdfParse from "pdf-parse";

// Use your real Vercel env vars
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl) console.error("Missing VITE_SUPABASE_URL");
if (!serviceRoleKey) console.error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// POST /api/process-invoice
// body: { orgId: string, filePath: string }
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST allowed" });
    return;
  }

  // Safely parse JSON body (might arrive as a string)
  let parsedBody: any = {};
  try {
    if (typeof req.body === "string") {
      parsedBody = JSON.parse(req.body);
    } else if (req.body) {
      parsedBody = req.body;
    }
  } catch (e) {
    console.error("Failed to parse body:", e);
    parsedBody = {};
  }

  const { orgId, filePath } = parsedBody as {
    orgId?: string;
    filePath?: string;
  };

  if (!orgId || !filePath) {
    res.status(400).json({ error: "Missing orgId or filePath" });
    return;
  }

  try {
    // 1) Download file from Supabase Storage (bucket: "invoices")
    const { data: fileData, error: fileErr } = await supabase.storage
      .from("invoices")
      .download(filePath);

    if (fileErr || !fileData) {
      console.error("storage download error", fileErr);
      res.status(500).json({ error: "Could not download file" });
      return;
    }

    const buffer = await toBuffer(fileData);

    // 2) Extract text from PDF
    const text = await extractTextFromPDF(buffer);

    // 3) Use your existing pipeline to parse + save + calculate CO2
    const result = await processInvoiceUpload({
      supabase,
      orgId,
      invoiceText: text,
      lines: [], // still no manual line items
    });

    res.status(200).json({ ok: true, result });
  } catch (e: any) {
    console.error("PROCESS ERROR:", e);
    res.status(500).json({
      error: e?.message ?? String(e) ?? "Unexpected processing error",
    });
  }
}

// ------------- helpers -------------

async function toBuffer(data: any): Promise<Buffer> {
  // Browser-like Blob case
  if (data && typeof data.arrayBuffer === "function") {
    const ab = await data.arrayBuffer();
    return Buffer.from(ab);
  }

  // Node stream case (Supabase on Vercel)
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
