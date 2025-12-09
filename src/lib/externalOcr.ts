// src/lib/externalOcr.ts
//
// Kaller OCR.Space for å få ren tekst fra fakturaen.
// Brukes fra InvoiceUpload for å sende tekst videre til invoiceParser.

export async function runExternalOcr(
  file: File,
  onStatus?: (msg: string) => void
): Promise<string> {
  const apiKey = import.meta.env.VITE_OCR_SPACE_API_KEY as string | undefined;

  if (!apiKey) {
    throw new Error(
      "Mangler VITE_OCR_SPACE_API_KEY. Legg den inn i .env og i Vercel Environment."
    );
  }

  onStatus?.("Sender faktura til OCR-tjeneste...");

  const formData = new FormData();
  formData.append("file", file);

  // ❌ INGEN language-parameter lenger – den ga E201-feil
  // formData.append("language", "nor");
  // eller "nor+eng" / "27" osv. – alt dette er fjernet.

  // Hjelpeparametere for fakturaer / tabeller
  formData.append("isTable", "true");
  formData.append("scale", "true");
  formData.append("OCREngine", "2");

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: {
      apikey: apiKey,
    },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`OCR-tjeneste svarte med HTTP ${res.status}`);
  }

  const data = await res.json();

  if (data.IsErroredOnProcessing) {
    const msg =
      (Array.isArray(data.ErrorMessage)
        ? data.ErrorMessage.join(" | ")
        : data.ErrorMessage) ||
      data.ErrorDetails ||
      "Ukjent feil";
    throw new Error(`OCR-tjeneste-feil: ${msg}`);
  }

  const parsedResults = data.ParsedResults;
  if (!parsedResults || !Array.isArray(parsedResults) || parsedResults.length === 0) {
    throw new Error("OCR-tjeneste returnerte ingen tekst");
  }

  // Slår sammen tekst fra alle sider
  const text = parsedResults
    .map((r: any) => (r && typeof r.ParsedText === "string" ? r.ParsedText : ""))
    .join("\n\n");

  return text.trim();
}
