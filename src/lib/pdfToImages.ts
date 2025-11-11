import * as pdfjsLib from "pdfjs-dist";

// Manually wire the pdf.js worker when running in the browser.  The
// "pdf.worker.entry" file was removed in pdfjs-dist v4, so we need to create a
// Worker instance ourselves and hand the port to pdf.js.
if (typeof window !== "undefined") {
  try {
    const worker = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url),
      { type: "module" },
    );
    pdfjsLib.GlobalWorkerOptions.workerPort = worker;
  } catch (err) {
    console.error("Failed to initialise pdf.js worker", err);
  }
}

export async function pdfToPngBlobs(file: File): Promise<Blob[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const blobs: Blob[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 }); // 2x for better OCR
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx as any, viewport }).promise;

    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
    blobs.push(blob);
  }

  return blobs;
}
