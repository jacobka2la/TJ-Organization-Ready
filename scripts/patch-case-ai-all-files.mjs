import fs from "node:fs";

const path = "src/components/CaseAI.tsx";
let source = fs.readFileSync(path, "utf8");

source = source.replace(
  'import { indexUploadedFile } from "@/services/document-index";',
  'import { indexUploadedFile, isCaseAIIndexableFile } from "@/services/document-index";',
);

source = source.replace(
  'const pdfs = files.filter((file) => isPdf(file) || isDocx(file));',
  'const pdfs = files.filter((file) => Boolean(file.storagePath && isCaseAIIndexableFile({ name: file.name, type: file.type || "" })));',
);
source = source.replace(
  'const pdfs = files.filter(isPdf);',
  'const pdfs = files.filter((file) => Boolean(file.storagePath && isCaseAIIndexableFile({ name: file.name, type: file.type || "" })));',
);

source = source.replace(
`        const missingPdfs = pdfs.filter(
          (file) =>
            !indexedFileIds.has(file.id) &&
            !attemptedIndexFileIdsRef.current.has(file.id),
        );`,
`        const missingPdfs = pdfs.filter((file) => {
          const versionKey = "case-ai-full-read-v2:" + clientId + ":" + file.id;
          return (
            (!indexedFileIds.has(file.id) || sessionStorage.getItem(versionKey) !== "done") &&
            !attemptedIndexFileIdsRef.current.has(file.id)
          );
        });`,
);

source = source.replace(
`        const missingPdfs = pdfs.filter(
          (file) => !indexedFileIds.has(file.id),
        );`,
`        const missingPdfs = pdfs.filter((file) => {
          const versionKey = "case-ai-full-read-v2:" + clientId + ":" + file.id;
          return !indexedFileIds.has(file.id) || sessionStorage.getItem(versionKey) !== "done";
        });`,
);

source = source.replace(
  'setIndexMessage("Preparing searchable case files...");',
  'setIndexMessage("Reading every searchable file in this case...");',
);
source = source.replace(
  'new Error("Could not open the uploaded PDF.")',
  'new Error("Could not open the uploaded file.")',
);
source = source.replace(
  'new Error("Could not download the PDF.")',
  'new Error("Could not download the file.")',
);

source = source.replace(
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
`            const localFile = new File([blob], item.name, {
              type: item.type || "application/octet-stream",
            });

            const indexResult = await indexUploadedFile({
              fileId: item.id,
              clientId,
              file: localFile,
            });`,
);

source = source.replace(
`            if (indexResult.indexedPages === 0) {
              unreadableCount += 1;
            }`,
`            if (indexResult.indexedPages === 0) {
              unreadableCount += 1;
            } else {
              sessionStorage.setItem(
                "case-ai-full-read-v2:" + clientId + ":" + item.id,
                "done",
              );
            }`,
);

source = source.replace(/PDFs could not be searched\./g, "files could not be read.");
source = source.replace(/PDF could not be searched\./g, "file could not be read.");
source = source.replace(/Some uploaded PDFs could not be prepared for search\./g, "Some uploaded files could not be prepared for search.");

fs.writeFileSync(path, source);
console.log("Case AI patched to index PDFs, DOCX, images, and text-based files.");
