import fs from "node:fs";

const filePath = "src/components/CaseAI.tsx";
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes('import { docxToClassifierPdfBase64 } from "@/lib/docxToPdf";')) {
  source = source.replace(
    'import { indexUploadedFile } from "@/services/document-index";',
    'import { indexUploadedFile } from "@/services/document-index";\nimport { docxToClassifierPdfBase64 } from "@/lib/docxToPdf";',
  );
}

const pdfAnchor = `const isPdf = (file: SearchableFile) =>
  Boolean(
    file.storagePath &&
      (file.type?.toLowerCase().includes("pdf") ||
        file.name.toLowerCase().endsWith(".pdf")),
  );`;

if (source.includes(pdfAnchor)) {
  source = source.replace(
    pdfAnchor,
    `const isPdf = (file: SearchableFile) =>
  Boolean(
    file.storagePath &&
      (file.type?.toLowerCase().includes("pdf") ||
        file.name.toLowerCase().endsWith(".pdf")),
  );

const isDocx = (file: SearchableFile) =>
  Boolean(
    file.storagePath &&
      (file.type?.toLowerCase().includes("wordprocessingml") ||
        file.name.toLowerCase().endsWith(".docx")),
  );

const classifierPdfToFile = (base64: string, originalName: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File(
    [bytes],
    originalName.replace(/\\.docx$/i, "") + ".pdf",
    { type: "application/pdf" },
  );
};`,
  );
}

const refAnchor = "  const conversationScrollRef = useRef<HTMLDivElement>(null);";
if (!source.includes("const caseIndexingRunRef = useRef(false);")) {
  source = source.replace(
    refAnchor,
    `${refAnchor}\n  const caseIndexingRunRef = useRef(false);\n  const attemptedIndexFileIdsRef = useRef(new Set<string>());`,
  );
}

const functionAnchor = "    const automaticallyIndexMissingPdfs = async () => {\n      const pdfs = files.filter(isPdf);";
if (source.includes(functionAnchor)) {
  source = source.replace(
    functionAnchor,
    `    const automaticallyIndexMissingPdfs = async () => {\n      if (caseIndexingRunRef.current) {\n        return;\n      }\n\n      const pdfs = files.filter((file) => isPdf(file) || isDocx(file));`,
  );
} else {
  source = source.replace(
    "      const pdfs = files.filter(isPdf);",
    "      const pdfs = files.filter((file) => isPdf(file) || isDocx(file));",
  );
}

const missingAnchor = `        const missingPdfs = pdfs.filter(
          (file) => !indexedFileIds.has(file.id),
        );`;
if (source.includes(missingAnchor)) {
  source = source.replace(
    missingAnchor,
    `        const missingPdfs = pdfs.filter(
          (file) =>
            !indexedFileIds.has(file.id) &&
            !attemptedIndexFileIdsRef.current.has(file.id),
        );`,
  );
}

const startAnchor = `        setIndexing(true);
        setIndexMessage("Preparing searchable case files...");`;
if (source.includes(startAnchor)) {
  source = source.replace(
    startAnchor,
    `        caseIndexingRunRef.current = true;
        setIndexing(true);
        setIndexMessage("Preparing searchable case files...");`,
  );
}

const itemAnchor = `          const item = missingPdfs[index];

          setIndexMessage(`;
if (source.includes(itemAnchor)) {
  source = source.replace(
    itemAnchor,
    `          const item = missingPdfs[index];
          attemptedIndexFileIdsRef.current.add(item.id);

          setIndexMessage(`,
  );
}

const localFileAnchor = `            const localFile = new File([blob], item.name, {
              type: item.type || "application/pdf",
            });

            const indexResult = await indexUploadedFile({
              fileId: item.id,
              clientId,
              file: localFile,
            });`;

if (source.includes(localFileAnchor)) {
  source = source.replace(
    localFileAnchor,
    `            const localFile = new File([blob], item.name, {
              type: item.type || (isDocx(item)
                ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                : "application/pdf"),
            });

            let fileForIndexing = localFile;
            if (isDocx(item)) {
              const classifierPdfBase64 = await docxToClassifierPdfBase64(localFile);
              fileForIndexing = classifierPdfToFile(classifierPdfBase64, item.name);
            }

            const indexResult = await indexUploadedFile({
              fileId: item.id,
              clientId,
              file: fileForIndexing,
            });`,
  );
}

const finallyAnchor = `      } finally {
        setIndexing(false);
      }`;
if (source.includes(finallyAnchor)) {
  source = source.replace(
    finallyAnchor,
    `      } finally {
        caseIndexingRunRef.current = false;
        setIndexing(false);
      }`,
  );
}

source = source.replace(/PDFs could not be searched\./g, "files could not be searched.");
source = source.replace(/PDF could not be searched\./g, "file could not be searched.");
source = source.replace(/uploaded PDFs/g, "uploaded files");

fs.writeFileSync(filePath, source);
console.log("Case AI indexing patched for stable PDF and DOCX indexing.");
