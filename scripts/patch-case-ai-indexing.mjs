import fs from "node:fs";

const filePath = "src/components/CaseAI.tsx";
let source = fs.readFileSync(filePath, "utf8");

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
    `    const automaticallyIndexMissingPdfs = async () => {\n      if (caseIndexingRunRef.current) {\n        return;\n      }\n\n      const pdfs = files.filter(isPdf);`,
  );
}

const missingAnchor = `        const missingPdfs = pdfs.filter(\n          (file) => !indexedFileIds.has(file.id),\n        );`;
if (source.includes(missingAnchor)) {
  source = source.replace(
    missingAnchor,
    `        const missingPdfs = pdfs.filter(\n          (file) =>\n            !indexedFileIds.has(file.id) &&\n            !attemptedIndexFileIdsRef.current.has(file.id),\n        );`,
  );
}

const startAnchor = `        setIndexing(true);\n        setIndexMessage("Preparing searchable case files...");`;
if (source.includes(startAnchor)) {
  source = source.replace(
    startAnchor,
    `        caseIndexingRunRef.current = true;\n        setIndexing(true);\n        setIndexMessage("Preparing searchable case files...");`,
  );
}

const itemAnchor = `          const item = missingPdfs[index];\n\n          setIndexMessage(`;
if (source.includes(itemAnchor)) {
  source = source.replace(
    itemAnchor,
    `          const item = missingPdfs[index];\n          attemptedIndexFileIdsRef.current.add(item.id);\n\n          setIndexMessage(`,
  );
}

const finallyAnchor = `      } finally {\n        setIndexing(false);\n      }`;
if (source.includes(finallyAnchor)) {
  source = source.replace(
    finallyAnchor,
    `      } finally {\n        caseIndexingRunRef.current = false;\n        setIndexing(false);\n      }`,
  );
}

fs.writeFileSync(filePath, source);
console.log("Case AI indexing patched to prevent overlapping/repeated indexing runs.");
