// api/azure-ocr.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileBase64, contentType } = req.body as {
      fileBase64?: string;
      contentType?: string;
    };

    if (!fileBase64) {
      return res.status(400).json({ error: 'Missing fileBase64 in body' });
    }

    const endpoint = process.env.VITE_AZURE_OCR_ENDPOINT;
    const key = process.env.VITE_AZURE_OCR_KEY1 || process.env.VITE_AZURE_OCR_KEY2;

    if (!endpoint || !key) {
      return res.status(500).json({
        error:
          'Azure OCR endpoint or key not configured. Check Vercel env vars VITE_AZURE_OCR_ENDPOINT and VITE_AZURE_OCR_KEY1/2.',
      });
    }

    // Remove trailing slash if present so we don't end up with "//formrecognizer..."
    const normalizedEndpoint = endpoint.replace(/\/+$/, '');

    // Azure Document Intelligence / Form Recognizer prebuilt invoice model
    const url =
      `${normalizedEndpoint}` +
      `/formrecognizer/documentModels/prebuilt-invoice:analyze?api-version=2023-07-31`;

    // Azure expects raw bytes, not base64 string
    const buffer = Buffer.from(fileBase64, 'base64');

    const azureResponse = await axios.post(url, buffer, {
      headers: {
        'Content-Type': contentType || 'application/pdf',
        'Ocp-Apim-Subscription-Key': key,
      },
    });

    // Pass through Azure DI response to the caller
    return res.status(200).json(azureResponse.data);
  } catch (err: any) {
    const status = err?.response?.status;
    const data = err?.response?.data;

    console.error('Azure Document Intelligence error:', status, data || err.message);

    return res.status(status || 500).json({
      error: 'Azure Document Intelligence call failed',
      status,
      details: data || err.message,
    });
  }
}
