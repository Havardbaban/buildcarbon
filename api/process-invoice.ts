import { createClient } from "@supabase/supabase-js";

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
    // OPTIONAL: check that the file exists in Storage
    const { data: fileData, error: fileErr } = await supabase.storage
      .from("invoices")
      .download(filePath);

    if (fileErr || !fileData) {
      console.error("storage download error", fileErr);
      res.status(500).json({ error: "Could not download file from storage" });
      return;
    }

    // 2) Insert a simple document row.
    // IMPORTANT: we ONLY write to supplier_org_number, not to any UUID column.
    const { data: doc, error: docErr } = await supabase
      .from("document")
      .insert({
        // org number from the form (123456789 etc)
        supplier_org_number: Number(orgId),

        // simple placeholder values for now
        total_amount: null,
        currency: "NOK",
        co2_kg: null,
        fuel_liters: null,
        issue_date: null,

        // keep a reference to the file path
        external_id: filePath,
      })
      .select("*")
      .single();

    if (docErr) {
      console.error("document insert error", docErr);
      res
        .status(500)
        .json({ error: docErr.message ?? "Insert failed" });
      return;
    }

    res.status(200).json({ ok: true, document: doc });
  } catch (e: any) {
    console.error("PROCESS ERROR:", e);
    res.status(500).json({
      error: e?.message ?? String(e) ?? "Unexpected processing error",
    });
  }
}
