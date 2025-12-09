// src/lib/externalOcr.ts
// Kaller OCR.Space og returnerer ParsedInvoice via invoiceParser.

import parseInvoice, { ParsedInvoice } from "./invoiceParser";

const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";

export async function runExternalOcr(
  file: File,
  onStatus?: (msg: string) => void
): Promise<ParsedInvoice> {
  const apiKey = import.meta.env.VITE_OCR_SPACE_API_KEY as
    | string
    | undefined;

  if (!apiKey) {
    throw new Error(
      "Mangler VITE_OCR_SPACE_API_KEY. Legg den inn i Vercel Environment."
    );
  }

  onStatus?.("Sender faktura til OCR-tjeneste...");

  const formData = new FormData();
  formData.append("file", file);

  // Norsk + engelsk, tabeller, bedre motor
  formData.append("language", "nor+eng");
  formData.append("isTable", "true");
  formData.append("scale", "true");
  formData.append("OCREngine", "2");

  const res = await fetch(OCR_SPACE_ENDPOINT, {
    method: "POST",
    headers: {
      apikey: apiKey,
    },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`OCR-tjeneste svarte med HTTP ${res.status}`);
  }

  const json = await res.json();

  if (json?.IsErroredOnProcessing) {
    const msg: string =
      json?.ErrorMessage?.[0] ||
      json?.ErrorMessage ||
      "Ukjent feil fra OCR-tjeneste.";

    // Gi litt snillere melding ved filstørrelse-feil
    if (
      /file size exceeds the maximum permissible file size/i.test(msg)
    ) {
      throw new Error(
        "Filen er for stor for OCR-tjenesten (maks ca. 1 MB på gratisnivå). " +
          "Prøv å lagre fakturaen som en mindre PDF eller ta et skjermbilde."
      );
    }

    throw new Error("OCR-tjeneste-feil: " + msg);
  }

  const results = json.ParsedResults || json.Parsedresults;
  if (!results || !Array.isArray(results) || results.length === 0) {
    throw new Error("OCR-tjenesten returnerte ingen tekst.");
  }

  const fullText = results
    .map((r: any) => r.ParsedText || "")
    .join("\n")
    .replace(/\r\n/g, "\n");

  // Bruk din forbedrede parser
  const parsed = await parseInvoice(fullText);
  return parsed;
}
