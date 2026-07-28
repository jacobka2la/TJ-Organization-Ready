import { supabase } from "@/lib/supabase";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker, type Worker } from "tesseract.js";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type IndexInput = {
  fileId: string;
  clientId: string;
  file: File;
};

type IndexResult = {
  indexedPages: number;
  totalPages: number;
  ocrPages: number;
  error: Error | null;
};

type DocumentPageRow = {
  client_id: string;
  file_id: string;
  page_number: number;
  content: string;
  updated_at: string;
};

const MIN_SELECTABLE_TEXT_LENGTH = 35;
const OCR_RENDER_SCALE = 1.8;
const INSERT_BATCH_SIZE = 100;

const isPdf = (file: File) =>
  file.type === "application/pdf" ||
  file.name.toLowerCase().endsWith(".pdf");

const normalizeText = (value: string) =>
  value.replace(/\s+/g, " ").trim();

async function extractSelectableText(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>["getPage"]>>,
) {
  const textContent = await page.getTextContent();

  return normalizeText(
    textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" "),
  );
}

async function renderPageToCanvas(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>["getPage"]>>,
) {
  const viewport = page.getViewport({
    scale: OCR_RENDER_SCALE,
  });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error("Could not create the OCR canvas.");
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
  canvasContext: context,
  viewport,
}).promise;

  return canvas;
}

async function recognizePage(
  worker: Worker,
  page: Awaited<ReturnType<Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>["getPage"]>>,
) {
  const canvas = await renderPageToCanvas(page);

  try {
    const result = await worker.recognize(canvas);
    return normalizeText(result.data.text || "");
  } finally {
    canvas.width = 1;
    canvas.height = 1;
    canvas.remove();
  }
}

async function saveDocumentPages(
  fileId: string,
  rows: DocumentPageRow[],
) {
  const { error: deleteError } = await supabase
    .from("document_pages")
    .delete()
    .eq("file_id", fileId);

  if (deleteError) {
    throw deleteError;
  }

  for (
    let start = 0;
    start < rows.length;
    start += INSERT_BATCH_SIZE
  ) {
    const { error: insertError } = await supabase
      .from("document_pages")
      .insert(rows.slice(start, start + INSERT_BATCH_SIZE));

    if (insertError) {
      throw insertError;
    }
  }
}

export async function extractFileTextForAI(file: File): Promise<{
  text: string;
  totalPages: number;
  ocrPages: number;
}> {
  if (!isPdf(file)) {
    return {
      text: "",
      totalPages: 0,
      ocrPages: 0,
    };
  }

  let worker: Worker | null = null;

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());

    const pdf = await pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;

    const pageTexts: string[] = [];
    let ocrPages = 0;

    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber += 1
    ) {
      const page = await pdf.getPage(pageNumber);

      let text = await extractSelectableText(page);

      if (text.length < MIN_SELECTABLE_TEXT_LENGTH) {
        if (!worker) {
          worker = await createWorker("eng", 1);
        }

        try {
          const ocrText = await recognizePage(worker, page);

          if (ocrText.length > text.length) {
            text = ocrText;
          }

          if (ocrText) {
            ocrPages += 1;
          }
        } catch (ocrError) {
          console.warn(
            `OCR failed for ${file.name}, page ${pageNumber}:`,
            ocrError,
          );
        }
      }

      if (text) {
        pageTexts.push(`PAGE ${pageNumber}\n${text}`);
      }

      page.cleanup();
    }

    return {
      text: pageTexts.join("\n\n").slice(0, 25000),
      totalPages: pdf.numPages,
      ocrPages,
    };
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

export async function indexUploadedFile({
  fileId,
  clientId,
  file,
}: IndexInput): Promise<IndexResult> {
  if (!isPdf(file)) {
    return {
      indexedPages: 0,
      totalPages: 0,
      ocrPages: 0,
      error: null,
    };
  }

  let worker: Worker | null = null;

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());

    const pdf = await pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;

    const rows: DocumentPageRow[] = [];
    let ocrPages = 0;

    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber += 1
    ) {
      const page = await pdf.getPage(pageNumber);

      let text = await extractSelectableText(page);

      if (text.length < MIN_SELECTABLE_TEXT_LENGTH) {
        if (!worker) {
          worker = await createWorker("eng", 1, {
            logger: (message) => {
              if (
                message.status === "recognizing text" &&
                typeof message.progress === "number"
              ) {
                console.debug(
                  `OCR ${file.name}: ${Math.round(
                    message.progress * 100,
                  )}%`,
                );
              }
            },
          });
        }

        try {
          const ocrText = await recognizePage(worker, page);

          if (ocrText.length > text.length) {
            text = ocrText;
          }

          if (ocrText) {
            ocrPages += 1;
          }
        } catch (ocrError) {
          console.warn(
            `OCR failed for ${file.name}, page ${pageNumber}:`,
            ocrError,
          );
        }
      }

      if (text) {
        rows.push({
          client_id: clientId,
          file_id: fileId,
          page_number: pageNumber,
          content: text,
          updated_at: new Date().toISOString(),
        });
      }

      page.cleanup();
    }

    await saveDocumentPages(fileId, rows);

    return {
      indexedPages: rows.length,
      totalPages: pdf.numPages,
      ocrPages,
      error: null,
    };
  } catch (error) {
    return {
      indexedPages: 0,
      totalPages: 0,
      ocrPages: 0,
      error:
        error instanceof Error
          ? error
          : new Error("PDF indexing and OCR failed."),
    };
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}