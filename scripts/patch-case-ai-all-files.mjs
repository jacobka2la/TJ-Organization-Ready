import fs from "node:fs";

const path = "src/components/CaseAI.tsx";
let source = fs.readFileSync(path, "utf8");

source = source.replace(
  'import { indexUploadedFile } from "@/services/document-index";',
  'import { indexUploadedFile, isCaseAIIndexableFile } from "@/services/document-index";',
);

source = source.replace(
`const isPdf = (file: SearchableFile) =>
  Boolean(
    file.storagePath &&
      (file.type?.toLowerCase().includes("pdf") ||
        file.name.toLowerCase().endsWith(".pdf")),
  );`,
`const isIndexable = (file: SearchableFile) =>
  Boolean(
    file.storagePath &&
      isCaseAIIndexableFile({ name: file.name, type: file.type || "" }),
  );`,
);

const oldEffectStart = `  useEffect(() => {
    const automaticallyIndexMissingPdfs = async () => {
      const pdfs = files.filter(isPdf);

      if (!clientId || pdfs.length === 0) {
        return;
      }

      try {
        const indexedResponse = await getIndexedFileIds(clientId);

        if (indexedResponse.error) {
          throw indexedResponse.error;
        }

        const indexedFileIds = new Set(indexedResponse.data || []);

        const missingPdfs = pdfs.filter(
          (file) => !indexedFileIds.has(file.id),
        );

        if (missingPdfs.length === 0) {
          return;
        }

        setIndexing(true);
        setIndexMessage("Preparing searchable case files...");

        let unreadableCount = 0;

        for (
          let index = 0;
          index < missingPdfs.length;
          index += 1
        ) {
          const item = missingPdfs[index];`;

const newEffectStart = `  useEffect(() => {
    const automaticallyIndexCaseFiles = async () => {
      const candidates = files.filter(isIndexable);

      if (!clientId || candidates.length === 0) {
        return;
      }

      try {
        const indexedResponse = await getIndexedFileIds(clientId);

        if (indexedResponse.error) {
          throw indexedResponse.error;
        }

        const indexedFileIds = new Set(indexedResponse.data || []);
        const indexVersion = "case-ai-full-read-v2";

        const filesToIndex = candidates.filter((file) => {
          const versionKey = `${indexVersion}:${clientId}:${file.id}`;
          return !indexedFileIds.has(file.id) || sessionStorage.getItem(versionKey) !== "done";
        });

        if (filesToIndex.length === 0) {
          return;
        }

        setIndexing(true);
        setIndexMessage("Reading every searchable file in this case...");

        let unreadableCount = 0;

        for (
          let index = 0;
          index < filesToIndex.length;
          index += 1
        ) {
          const item = filesToIndex[index];`;

source = source.replace(oldEffectStart, newEffectStart);
source = source.replaceAll("missingPdfs.length", "filesToIndex.length");
source = source.replace('new Error("Could not open the uploaded PDF.")', 'new Error("Could not open the uploaded file.")');
source = source.replace('new Error("Could not download the PDF.")', 'new Error("Could not download the file.")');
source = source.replace('type: item.type || "application/pdf",', 'type: item.type || "application/octet-stream",');

source = source.replace(
`            if (indexResult.indexedPages === 0) {
              unreadableCount += 1;
            }`,
`            if (indexResult.indexedPages === 0) {
              unreadableCount += 1;
            } else {
              sessionStorage.setItem(
                \`case-ai-full-read-v2:\${clientId}:\${item.id}\`,
                "done",
              );
            }`,
);

source = source.replace(
`            ? \`${unreadableCount} PDF\${
                unreadableCount === 1 ? "" : "s"
              } could not be searched.\`
            : "",`,
`            ? \`${unreadableCount} file\${unreadableCount === 1 ? "" : "s"} could not be read.\`
            : "All readable case files are indexed.",`,
);

source = source.replace(
  '"Some uploaded PDFs could not be prepared for search."',
  '"Some uploaded files could not be prepared for search."',
);
source = source.replace(
  "void automaticallyIndexMissingPdfs();",
  "void automaticallyIndexCaseFiles();",
);

fs.writeFileSync(path, source);
