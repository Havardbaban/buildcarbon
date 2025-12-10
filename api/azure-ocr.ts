import type { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { fileBase64 } = req.body;

    if (!fileBase64) {
      return res.status(400).json({ error: "Missing fileBase64" });
    }

    const endpoint = process.env.VITE_AZURE_OCR_ENDPOINT;
    const key = process.env.VITE_AZURE_OCR_KEY1;

    const url =
      `${endpoint}/formrecognizer/documentModels/prebuilt-invoice:analyze?api-version=2023-10-31-preview`;

    const buffer = Buffer.from(fileBase64, "base64");

    const response = await axios.post(url, buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Ocp-Apim-Subscription-Key": key!,
      },
    });

    return res.status(200).json(response.data);

  } catch (err: any) {
    console.error("Azure OCR Error:", err.response?.data || err.message);
    return res.status(500).json({
      error: err.response?.data || "Unknown Azure OCR error",
    });
  }
}
