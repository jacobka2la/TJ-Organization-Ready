const textDecoder = new TextDecoder();

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function extractDocxText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error("This Word document could not be opened.");
  }

  let offset = view.getUint32(eocdOffset + 16, true);
  let entry: { compression: number; compressedSize: number; localOffset: number } | null = null;

  while (offset + 46 <= bytes.length && view.getUint32(offset, true) === 0x02014b50) {
    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const fileName = textDecoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));

    if (fileName === "word/document.xml") {
      entry = { compression, compressedSize, localOffset };
      break;
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  if (!entry) {
    throw new Error("This DOCX does not contain readable Word document text.");
  }

  if (view.getUint32(entry.localOffset, true) !== 0x04034b50) {
    throw new Error("This Word document has an invalid file structure.");
  }

  const localNameLength = view.getUint16(entry.localOffset + 26, true);
  const localExtraLength = view.getUint16(entry.localOffset + 28, true);
  const dataOffset = entry.localOffset + 30 + localNameLength + localExtraLength;
  const compressed = bytes.slice(dataOffset, dataOffset + entry.compressedSize);

  let xmlBytes: Uint8Array;
  if (entry.compression === 0) {
    xmlBytes = compressed;
  } else if (entry.compression === 8) {
    xmlBytes = await inflateRaw(compressed);
  } else {
    throw new Error("This DOCX uses an unsupported compression format.");
  }

  const xml = textDecoder.decode(xmlBytes);
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  const paragraphs = Array.from(parsed.getElementsByTagNameNS("*", "p"))
    .map((paragraph) => (paragraph.textContent || "").trim())
    .filter(Boolean);

  const text = paragraphs.join("\n").trim();
  if (!text) {
    throw new Error("No readable text was found in this Word document.");
  }

  return text;
}

function makeAscii(value: string): string {
  let output = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === "\n" || (code >= 32 && code <= 126)) output += char;
    else output += " ";
  }
  return output;
}

function wrapText(value: string, width = 95): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      const candidate = (line + " " + word).trim();
      if (candidate.length > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function textToPdfBase64(text: string, filename: string): string {
  const source = makeAscii("Original Word filename: " + filename + "\n\n" + text).slice(0, 60000);
  const lines = wrapText(source);
  const linesPerPage = 58;
  const pageCount = Math.max(1, Math.ceil(Math.max(lines.length, 1) / linesPerPage));
  const objects = new Map<number, string>();
  const pageObjects: number[] = [];

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageObject = 4 + pageIndex * 2;
    const contentObject = pageObject + 1;
    pageObjects.push(pageObject);

    const pageLines = lines.slice(pageIndex * linesPerPage, (pageIndex + 1) * linesPerPage);
    const commands = ["BT", "/F1 9 Tf", "11 TL", "40 750 Td"];
    for (const line of pageLines) {
      const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
      commands.push("(" + escaped + ") Tj", "T*");
    }
    commands.push("ET");

    const stream = commands.join("\n");
    objects.set(
      pageObject,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents " +
        contentObject +
        " 0 R >>",
    );
    objects.set(contentObject, "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
  }

  objects.set(
    2,
    "<< /Type /Pages /Kids [" + pageObjects.map((number) => number + " 0 R").join(" ") + "] /Count " + pageCount + " >>",
  );

  const maxObject = 3 + pageCount * 2;
  let pdf = "%PDF-1.4\n";
  const offsets = new Array<number>(maxObject + 1).fill(0);

  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    offsets[objectNumber] = pdf.length;
    pdf += objectNumber + " 0 obj\n" + (objects.get(objectNumber) || "<<>>") + "\nendobj\n";
  }

  const xrefOffset = pdf.length;
  pdf += "xref\n0 " + (maxObject + 1) + "\n";
  pdf += "0000000000 65535 f \n";
  for (let objectNumber = 1; objectNumber <= maxObject; objectNumber += 1) {
    pdf += String(offsets[objectNumber]).padStart(10, "0") + " 00000 n \n";
  }
  pdf += "trailer\n<< /Size " + (maxObject + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";

  return btoa(pdf);
}

export async function docxToClassifierPdfBase64(file: File): Promise<string> {
  const text = await extractDocxText(file);
  return textToPdfBase64(text, file.name);
}
