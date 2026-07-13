import { supabase } from "@/lib/supabase";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type IndexInput = {
  fileId: string;
  clientId: string;
  file: File;
};

type IndexResult = {
  indexedPages: number;
  totalPages: number;
  error: Error | null;
};

const isPdf = (file: File) =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

export async function indexUploadedFile({
  fileId,
  clientId,
  file,
}: IndexInput): Promise<IndexResult> {
  if (!isPdf(file)) {
    return { indexedPages: 0, totalPages: 0, error: null };
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const rows: Array<{
      client_id: string;
      file_id: string;
      page_number: number;
      content: string;
      updated_at: string;
    }> = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (text) {
        rows.push({
          client_id: clientId,
          file_id: fileId,
          page_number: pageNumber,
          content: text,
          updated_at: new Date().toISOString(),
        });
      }
    }

    const { error: deleteError } = await supabase
      .from("document_pages")
      .delete()
      .eq("file_id", fileId);

    if (deleteError) throw deleteError;

    for (let start = 0; start < rows.length; start += 100) {
      const { error: insertError } = await supabase
        .from("document_pages")
        .insert(rows.slice(start, start + 100));

      if (insertError) throw insertError;
    }

    return {
      indexedPages: rows.length,
      totalPages: pdf.numPages,
      error: null,
    };
  } catch (error) {
    return {
      indexedPages: 0,
      totalPages: 0,
      error: error instanceof Error ? error : new Error("PDF indexing failed."),
    };
  }
}
