// src/lib/externalOcr.ts
/**
 * Runs OCR by calling our serverless API route /api/azure-ocr,
 * which talks to Azure Document Intelligence.
 */

export type ExternalOcrSuccess = {
  ok: true;
  provider: 'azure-document-intelligence';
  raw: any;        // full Azure response
};

export type ExternalOcrError = {
  ok: false;
  provider: 'azure-document-intelligence';
  message: string;
  status?: number;
  details?: any;
};

export type ExternalOcrResult = ExternalOcrSuccess | ExternalOcrError;

/**
 * file: the original invoice File (PDF / image)
 */
export async function runExternalOcr(file: File): Promise<ExternalOcrResult> {
  try {
    // Read file as base64 in the browser
    const fileBase64 = await fileToBase64(file);

    const resp = await fetch('/api/azure-ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64,
        contentType: file.type || 'application/pdf',
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        ok: false,
        provider: 'azure-document-intelligence',
        message:
          `Azure Document Intelligence failed (${resp.status}).` +
          (data?.error ? ` ${data.error}` : ''),
        status: resp.status,
        details: data,
      };
    }

    return {
      ok: true,
      provider: 'azure-document-intelligence',
      raw: data,
    };
  } catch (err: any) {
    console.error('runExternalOcr error', err);

    return {
      ok: false,
      provider: 'azure-document-intelligence',
      message: 'Unknown Azure Document Intelligence error',
      details: err?.message || err,
    };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Data URL looks like "data:application/pdf;base64,AAAA..."
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}
