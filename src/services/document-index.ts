import { supabase } from "@/lib/supabase";
import { extractDocxText } from "@/lib/docxToPdf";
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
const INSERT_BATCH_SIZE = 25;
const OCR_TIMEOUT_MS = 18000;
const OCR_WORKER_TIMEOUT_MS = 12000;
const TEXT_CHUNK_SIZE = 8000;

const lowerName = (file: Pick<File, "name">) => file.name.toLowerCase();

const isPdf = (file: File) =>
  file.type === "application/pdf" || lowerName(file).endsWith(".pdf");

const isDocx = (file: File) =>
  file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
  lowerName(file).endsWith(".docx");

const isImage = (file: File) =>
  file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.name);

const isPlainTextLike = (file: File) =>
  file.type.startsWith("text/") ||
  /\.(txt|csv|json|xml|html?|md|rtf|log)$/i.test(file.name) ||
  ["application/json", "application/xml", "application/rtf"].includes(file.type);

export const isCaseAIIndexableFile = (file: Pick<File, "name" | "type">) => {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    type === "application/pdf" ||
    name.endsWith(".pdf") ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx") ||
    type.startsWith("image/") ||
    /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(name) ||
    type.startsWith("text/") ||
    /\.(txt|csv|json|xml|html?|md|rtf|log)$/i.test(name) ||
    ["application/json", "application/xml", "application/rtf"].includes(type)
  );
};

const normalizeText = (value: string) =>
  value.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> => {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

async function extractSelectableText(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>["getPage"]>>,
) {
  const textContent = await page.getTextContent();
  return normalizeText(
    textContent.items.map((item) => ("str" in item ? item.str : "")).join(" "),
  );
}

async function renderPageToCanvas(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>["getPage"]>>,
) {
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw new Error("Could not create the OCR canvas.");

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

async function createOcrWorker(fileName: string) {
  return withTimeout(
    createWorker("eng", 1, {
      logger: (message) => {
        if (message.status === "recognizing text" && typeof message.progress === "number") {
          console.debug(`OCR ${fileName}: ${Math.round(message.progress * 100)}%`);
        }
      },
    }),
    OCR_WORKER_TIMEOUT_MS,
    "OCR engine took too long to start.",
  );
}

async function recognizePdfPage(
  worker: Worker,
  page: Awaited<ReturnType<Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>["getPage"]>>,
) {
  const canvas = await renderPageToCanvas(page);
  try {
    const result = await withTimeout(
      worker.recognize(canvas),
      OCR_TIMEOUT_MS,
      "OCR timed out for this page.",
    );
    return normalizeText(result.data.text || "");
  } finally {
    canvas.width = 1;
    canvas.height = 1;
    canvas.remove();
  }
}

async function recognizeImage(worker: Worker, file: File) {
  const result = await withTimeout(
    worker.recognize(file),
    OCR_TIMEOUT_MS * 2,
    "OCR timed out for this image.",
  );
  return normalizeText(result.data.text || "");
}

async function clearDocumentPages(fileId: string) {
  const { error } = await supabase.from("document_pages").delete().eq("file_id", fileId);
  if (error) throw error;
}

async function insertDocumentPages(rows: DocumentPageRow[]) {
  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    const { error } = await supabase
      .from("document_pages")
      .insert(rows.slice(start, start + INSERT_BATCH_SIZE));
    if (error) throw error;
  }
}

function chunkText(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += TEXT_CHUNK_SIZE) {
    chunks.push(normalized.slice(start, start + TEXT_CHUNK_SIZE));
  }
  return chunks;
}

async function extractTextLikeFile(file: File) {
  let text = await file.text();
  if (/\.html?$/i.test(file.name) || file.type.includes("html")) {
    const parsed = new DOMParser().parseFromString(text, "text/html");
    text = parsed.body?.textContent || text;
  } else if (/\.rtf$/i.test(file.name) || file.type === "application/rtf") {
    text = text
      .replace(/\\'[0-9a-fA-F]{2}/g, " ")
      .replace(/\\[a-z]+-?\d* ?/g, " ")
      .replace(/[{}]/g, " ");
  }
  return normalizeText(text);
}

export async function extractFileTextForAI(file: File): Promise<{
  text: string;
  totalPages: number;
  ocrPages: number;
}> {
  if (isDocx(file)) {
    const text = normalizeText(await extractDocxText(file));
    return { text: text.slice(0, 100000), totalPages: Math.max(1, chunkText(text).length), ocrPages: 0 };
  }

  if (isPlainTextLike(file)) {
    const text = await extractTextLikeFile(file);
    return { text: text.slice(0, 100000), totalPages: Math.max(1, chunkText(text).length), ocrPages: 0 };
  }

  if (isImage(file)) {
    const worker = await createOcrWorker(file.name);
    try {
      const text = await recognizeImage(worker, file);
      return { text: text.slice(0, 100000), totalPages: 1, ocrPages: text ? 1 : 0 };
    } finally {
      await worker.terminate();
    }
  }

  if (!isPdf(file)) return { text: "", totalPages: 0, ocrPages: 0 };

  let worker: Worker | null = null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
    const pageTexts: string[] = [];
    let ocrPages = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      let text = await extractSelectableText(page);
      if (text.length < MIN_SELECTABLE_TEXT_LENGTH) {
        try {
          if (!worker) worker = await createOcrWorker(file.name);
          const ocrText = await recognizePdfPage(worker, page);
          if (ocrText.length > text.length) text = ocrText;
          if (ocrText) ocrPages += 1;
        } catch (error) {
          console.warn(`OCR skipped for ${file.name}, page ${pageNumber}:`, error);
        }
      }
      if (text) pageTexts.push(`PAGE ${pageNumber}\n${text}`);
      page.cleanup();
    }

    return { text: pageTexts.join("\n\n").slice(0, 100000), totalPages: pdf.numPages, ocrPages };
  } finally {
    if (worker) await worker.terminate();
  }
}

export async function indexUploadedFile({ fileId, clientId, file }: IndexInput): Promise<IndexResult> {
  let indexedPages = 0;
  let totalPages = 0;
  let ocrPages = 0;
  let worker: Worker | null = null;

  try {
    await clearDocumentPages(fileId);

    if (isPdf(file)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
      totalPages = pdf.numPages;
      let pendingRows: DocumentPageRow[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        let text = await extractSelectableText(page);

        if (text.length < MIN_SELECTABLE_TEXT_LENGTH) {
          try {
            if (!worker) worker = await createOcrWorker(file.name);
            const ocrText = await recognizePdfPage(worker, page);
            if (ocrText.length > text.length) text = ocrText;
            if (ocrText) ocrPages += 1;
          } catch (ocrError) {
            console.warn(`OCR skipped for ${file.name}, page ${pageNumber}:`, ocrError);
          }
        }

        if (text) {
          pendingRows.push({ client_id: clientId, file_id: fileId, page_number: pageNumber, content: text, updated_at: new Date().toISOString() });
          indexedPages += 1;
        }

        if (pendingRows.length >= INSERT_BATCH_SIZE || pageNumber === pdf.numPages) {
          await insertDocumentPages(pendingRows);
          pendingRows = [];
        }
        page.cleanup();
      }
    } else {
      let text = "";
      if (isDocx(file)) {
        text = await extractDocxText(file);
      } else if (isPlainTextLike(file)) {
        text = await extractTextLikeFile(file);
      } else if (isImage(file)) {
        worker = await createOcrWorker(file.name);
        text = await recognizeImage(worker, file);
        if (text) ocrPages = 1;
      } else {
        return { indexedPages: 0, totalPages: 0, ocrPages: 0, error: null };
      }

      const chunks = chunkText(text);
      totalPages = chunks.length;
      const now = new Date().toISOString();
      await insertDocumentPages(
        chunks.map((content, index) => ({
          client_id: clientId,
          file_id: fileId,
          page_number: index + 1,
          content,
          updated_at: now,
        })),
      );
      indexedPages = chunks.length;
    }

    return { indexedPages, totalPages, ocrPages, error: null };
  } catch (error) {
    return {
      indexedPages,
      totalPages,
      ocrPages,
      error: error instanceof Error ? error : new Error("Document indexing failed."),
    };
  } finally {
    if (worker) await worker.terminate();
  }
}
