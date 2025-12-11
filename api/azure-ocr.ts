import type { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // We’ll declare url outside so we can log it in the catch block
  let url = "";

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { fileBase64 } = req.body as { fileBase64?: string };

    if (!fileBase64) {
      return res.status(400).json({ error: "Missing fileBase64" });
    }

    const endpoint = process.env.VITE_AZURE_OCR_ENDPOINT;
    const key = process.env.VITE_AZURE_OCR_KEY1;

    if (!endpoint || !key) {
      return res.status(500).json({
        error: "Azure OCR is not configured. Check VITE_AZURE_OCR_ENDPOINT and VITE_AZURE_OCR_KEY1 in Vercel.",
      });
    }

    // Use the GA Document Intelligence / Form Recognizer invoice endpoint
    // This is the same family of API used in the Azure "Live test" screen you showed.
    url = `${endpoint.replace(/\/+$/, "")}/formrecognizer/documentModels/prebuilt-invoice:analyze?api-version=2023-07-31`;

    const buffer = Buffer.from(fileBase64, "base64");

    const response = await axios.post(url, buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Ocp-Apim-Subscription-Key": key,
      },
    });

    // For 2023-07-31, some endpoints return 202 + Operation-Location.
    // If that happens we just pass the raw response back so we can see it.
    return res.status(response.status).json(response.data ?? null);
  } catch (err: any) {
    // Extra logging so we see the REAL Azure message in Vercel logs
    console.error("Azure OCR Error details:", {
      url,
      message: err?.message,
      status: err?.response?.status,
      data: err?.response?.data,
    });

    return res.status(500).json({
      error: err?.response?.data || err?.message || "Unknown Azure OCR error",
    });
  }
}
