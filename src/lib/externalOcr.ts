// src/lib/externalOcr.ts

/**
 * Enkel integrasjon mot OCR.Space (eller lignende HTTP-basert OCR-tjeneste).
 *
 * Du må sette en env-variabel i Vite:
 *  VITE_OCR_SPACE_API_KEY=din_nøkkel
 *
 * NB: I en ordentlig produksjonsløsning bør nøkkelen ligge på backend,
 * men for rask MVP/pilot-testing kan dette være OK.
 */

const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";

type OcrSpaceResponse = {
  IsErroredOnProcessing: boolean;
  ErrorMessage?: string[] | string;
  ParsedResults?: Array<{
    ParsedText?: string;
  }>;
};

export async function runExternalOcr(
  file: File,
  onStatus?: (msg: string) => void
): Promise<string> {
  const apiKey = import.meta.env.VITE_OCR_SPACE_API_KEY as string | undefined;

  if (!apiKey) {
    throw new Error(
      "Mangler VITE_OCR_SPACE_API_KEY. Legg den til i .env og restart dev-server."
    );
  }

  onStatus?.("Sender faktura til OCR-tjeneste...");

 const formData = new FormData();
formData.append("file", file);
formData.append("language", "auto");  // ✅ la OCR.Space autodetektere språk
formData.append("isTable", "true");
formData.append("scale", "true");
formData.append("OCREngine", "2");    // kreves for 'auto'

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

  const json = (await res.json()) as OcrSpaceResponse;

  if (json.IsErroredOnProcessing) {
    const msg =
      (Array.isArray(json.ErrorMessage)
        ? json.ErrorMessage[0]
        : json.ErrorMessage) || "Ukjent OCR-feil";
    throw new Error("OCR-tjenesten feilet: " + msg);
  }

  let text = "";

  if (Array.isArray(json.ParsedResults)) {
    for (const r of json.ParsedResults) {
      if (r.ParsedText) {
        text += r.ParsedText + "\n";
      }
    }
  }

  onStatus?.("OCR fullført.");

  return text.trim();
}
