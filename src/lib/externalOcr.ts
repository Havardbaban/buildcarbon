// src/lib/externalOcr.ts
//
// Kaller Mindee V2 /v2/inferences/enqueue med custom invoice-modell.
// Brukes fra InvoiceUpload for å få ren tekst vi kan sende til invoiceParser.

export async function runExternalOcr(
  file: File,
  onStatus?: (msg: string) => void
): Promise<string> {
  const apiKey = import.meta.env.VITE_MINDEE_API_KEY;
  const modelId = import.meta.env.VITE_MINDEE_MODEL_ID;

  if (!apiKey) {
    throw new Error(
      "Mangler VITE_MINDEE_API_KEY. Legg den inn i Vercel Environment."
    );
  }

  if (!modelId) {
    throw new Error(
      "Mangler VITE_MINDEE_MODEL_ID. Legg den inn i Vercel Environment."
    );
  }

  onStatus?.("Sender faktura til Mindee Invoice API (v2)…");

  // 1) Enqueue: POST /v2/inferences/enqueue
  const formData = new FormData();
  formData.append("document", file);
  formData.append("modelId", modelId);
  // ber Mindee også gi full OCR-tekst per side
  formData.append("rawText", "true");

  const enqueueRes = await fetch(
    "https://api-v2.mindee.net/v2/inferences/enqueue",
    {
      method: "POST",
      headers: {
        // V2: KUN API-nøkkelen, ingen 'Token ' foran
        Authorization: apiKey,
      },
      body: formData,
    }
  );

  if (!enqueueRes.ok) {
    const errBody = await enqueueRes.text().catch(() => "(ingen body)");
    throw new Error(
      `Mindee enqueue feilet med HTTP ${enqueueRes.status}: ${errBody}`
    );
  }

  const enqueueJson: any = await enqueueRes.json();

  const pollingUrl: string | undefined = enqueueJson?.polling_url;
  let resultUrl: string | undefined = enqueueJson?.result_url;

  if (!pollingUrl && !resultUrl) {
    throw new Error(
      "Mindee-respons mangler både polling_url og result_url."
    );
  }

  // 2) Poll hvis vi ikke fikk result_url direkte
  if (!resultUrl && pollingUrl) {
    onStatus?.("Venter på Mindee-resultat…");

    for (let i = 0; i < 30; i++) {
      // anbefalt: minst 1 sekund mellom pollinger
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const pollRes = await fetch(pollingUrl, {
        headers: { Authorization: apiKey },
      });

      if (!pollRes.ok) {
        const body = await pollRes.text().catch(() => "(ingen body)");
        throw new Error(
          `Mindee polling feilet med HTTP ${pollRes.status}: ${body}`
        );
      }

      const pollJson: any = await pollRes.json();
      resultUrl = pollJson?.result_url;

      if (resultUrl) break;
    }

    if (!resultUrl) {
      throw new Error("Fikk aldri result_url fra Mindee etter polling.");
    }
  }

  // 3) Hent selve resultatet
  const resultRes = await fetch(resultUrl!, {
    headers: { Authorization: apiKey },
  });

  if (!resultRes.ok) {
    const body = await resultRes.text().catch(() => "(ingen body)");
    throw new Error(
      `Mindee result feilet med HTTP ${resultRes.status}: ${body}`
    );
  }

  const resultJson: any = await resultRes.json();

  // 4) Plukk ut full tekst (raw_text) per side
  // Struktur kan være litt forskjellig, så vi prøver begge variantene.
  const pages =
    resultJson?.result?.document?.inference?.pages ??
    resultJson?.document?.inference?.pages ??
    [];

  const textChunks: string[] = [];

  for (const page of pages) {
    const raw =
      page?.extras?.raw_text ??
      page?.extras?.rawText ??
      page?.extras?.full_text ??
      "";

    if (typeof raw === "string" && raw.trim().length > 0) {
      textChunks.push(raw);
    }
  }

  const fullText = textChunks.join("\n\n").trim();

  if (!fullText) {
    // fallback: stringify hele json hvis vi ikke fikk tekst (så ser vi hva som skjer)
    return JSON.stringify(resultJson, null, 2);
  }

  return fullText;
}
