import fs from "node:fs";

const filePath = "src/components/AIClientImport.tsx";
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes('import { docxToClassifierPdfBase64 } from "@/lib/docxToPdf";')) {
  source = source.replace(
    'import { uploadClientFile } from "@/services/files";',
    'import { uploadClientFile } from "@/services/files";\nimport { docxToClassifierPdfBase64 } from "@/lib/docxToPdf";',
  );
}

source = source.replace(
  /type SelectedPdf = \{[\s\S]*?\n\};/,
  `type SelectedDocument = {
  file: File;
  originalFilename: string;
  classifierPdfBase64: string | null;
  kind: "pdf" | "docx" | "doc";
};`,
);

source = source.replace(
  /const ensurePdfExtension = \(name: string\) => \{[\s\S]*?\n\};/,
  `const ensureOriginalExtension = (name: string, originalFilename: string) => {
  const match = originalFilename.match(/\\.(pdf|docx|doc)$/i);
  const extension = match?.[1]?.toLowerCase() || "pdf";
  const clean = name.trim().replace(/\\.(pdf|docx|doc)$/i, "");
  return \`\${clean || "Untitled Document"}.\${extension}\`;
};`,
);

source = source.replace(
  'const [selectedPdfs, setSelectedPdfs] = useState<SelectedPdf[]>([]);',
  'const [selectedPdfs, setSelectedPdfs] = useState<SelectedDocument[]>([]);',
);

const handleStart = source.indexOf(" const handleFolderSelection = async (");
const analyzeStart = source.indexOf("const analyzeFolder = async (", handleStart);
const updateClientStart = source.indexOf("  const updateClient = (", analyzeStart);

if (handleStart === -1 || analyzeStart === -1 || updateClientStart === -1) {
  throw new Error("Could not locate AI import functions to patch.");
}

const replacement = ` const handleFolderSelection = async (
  event: React.ChangeEvent<HTMLInputElement>,
) => {
  const files = Array.from(event.target.files || []);

  const supportedFiles = files.filter((file) => {
    const lowerName = file.name.toLowerCase();
    const lowerType = file.type.toLowerCase();
    return (
      lowerType === "application/pdf" ||
      lowerName.endsWith(".pdf") ||
      lowerType.includes("wordprocessingml") ||
      lowerType.includes("msword") ||
      lowerName.endsWith(".docx") ||
      lowerName.endsWith(".doc")
    );
  });

  if (supportedFiles.length === 0) {
    setError("That folder does not contain any PDFs or Word documents.");
    return;
  }

  const relativePath =
    (supportedFiles[0] as File & { webkitRelativePath?: string })
      .webkitRelativePath || "";

  const detectedFolderName =
    relativePath.split("/")[0] || "Imported Client";

  setError("");
  setFolderName(detectedFolderName);
  setStep("reading");

  setProgress({
    current: 0,
    total: supportedFiles.length,
    label: "Reading documents",
  });

  const preparedDocuments: SelectedDocument[] = [];

  for (let index = 0; index < supportedFiles.length; index += 1) {
    const file = supportedFiles[index];
    const lowerName = file.name.toLowerCase();
    const kind: SelectedDocument["kind"] = lowerName.endsWith(".docx")
      ? "docx"
      : lowerName.endsWith(".doc")
        ? "doc"
        : "pdf";

    setProgress({
      current: index + 1,
      total: supportedFiles.length,
      label: \`Reading \${file.name}\`,
    });

    try {
      let classifierPdfBase64: string | null = null;

      if (kind === "pdf") {
        classifierPdfBase64 = await fileToBase64(file);
      } else if (kind === "docx") {
        classifierPdfBase64 = await docxToClassifierPdfBase64(file);
      }

      preparedDocuments.push({
        file,
        originalFilename: file.name,
        classifierPdfBase64,
        kind,
      });
    } catch (fileError) {
      console.error("Could not read document:", file.name, fileError);

      preparedDocuments.push({
        file,
        originalFilename: file.name,
        classifierPdfBase64: null,
        kind,
      });
    }
  }

  setSelectedPdfs(preparedDocuments);
  await analyzeFolder(detectedFolderName, preparedDocuments);
};

const analyzeFolder = async (
  name: string,
  documents: SelectedDocument[],
) => {
  setStep("analyzing");
  setError("");

  const documentResults: ImportDocumentPlan[] = [];

  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index];

    setProgress({
      current: index + 1,
      total: documents.length,
      label: \`Analyzing \${document.originalFilename}\`,
    });

    if (!document.classifierPdfBase64) {
      const isOldDoc = document.kind === "doc";
      documentResults.push({
        originalFilename: document.originalFilename,
        documentType: isOldDoc ? "Legacy Word Document" : "Unreadable Document",
        suggestedFolder: "Needs Review",
        suggestedFilename: document.originalFilename.replace(/\\.(pdf|docx|doc)$/i, ""),
        confidence: 0,
        needsReview: true,
        reason: isOldDoc
          ? "Legacy .doc Word files are imported but require manual review because this older binary format cannot be reliably read in the browser."
          : "The document could not be read for AI classification, so it was kept for manual review instead of being skipped.",
        clientNamesFound: [],
        providerOrOrganization: null,
        importantDateStart: null,
        importantDateEnd: null,
        includeDateInFilename: false,
        possibleWrongClient: false,
        possiblyUnrelated: false,
      });
      continue;
    }

    const { data, error: invokeError } = await supabase.functions.invoke(
      "ai-classify-document",
      {
        body: {
          originalFilename: document.originalFilename,
          pdfBase64: document.classifierPdfBase64,
        },
      },
    );

    if (invokeError || !data?.success || !data?.classification) {
      console.error(
        "Document classification failed:",
        document.originalFilename,
        invokeError,
        data,
      );

      documentResults.push({
        originalFilename: document.originalFilename,
        documentType: "Classification Failed",
        suggestedFolder: "Needs Review",
        suggestedFilename: document.originalFilename.replace(/\\.(pdf|docx|doc)$/i, ""),
        confidence: 0,
        needsReview: true,
        reason:
          data?.error ||
          invokeError?.message ||
          "The document could not be classified.",
        clientNamesFound: [],
        providerOrOrganization: null,
        importantDateStart: null,
        importantDateEnd: null,
        includeDateInFilename: false,
        possibleWrongClient: false,
        possiblyUnrelated: false,
      });
      continue;
    }

    documentResults.push({
      originalFilename: document.originalFilename,
      ...data.classification,
    });
  }

  const fallbackName = splitFullName(name.replace(/[_-]+/g, " "));

  const foundClientNames = documentResults
    .flatMap((document) => document.clientNamesFound || [])
    .filter(Boolean);

  const mostCommonClientName =
    foundClientNames.length > 0
      ? foundClientNames
          .sort(
            (a, b) =>
              foundClientNames.filter((name) => name === b).length -
              foundClientNames.filter((name) => name === a).length,
          )[0]
      : null;

  const detectedName = mostCommonClientName
    ? splitFullName(mostCommonClientName)
    : fallbackName;

  const foldersToCreate = ALLOWED_FOLDERS.filter((folder) =>
    documentResults.some((document) => document.suggestedFolder === folder),
  );

  const nextPlan: ImportPlan = {
    client: {
      fullName: mostCommonClientName || name,
      firstName: detectedName.firstName,
      lastName: detectedName.lastName,
      dateOfBirth: null,
      phone: null,
      email: null,
      address: null,
      caseType: "Personal Injury",
      confidence: mostCommonClientName ? 0.8 : 0.5,
      needsReview: !mostCommonClientName,
      reason: mostCommonClientName
        ? "The client name was found across the classified documents."
        : "The client name was taken from the selected folder name.",
    },
    foldersToCreate,
    documents: documentResults,
    summary: {
      totalDocuments: documentResults.length,
      readyToImport: documentResults.filter((document) => !document.needsReview).length,
      needsReview: documentResults.filter((document) => document.needsReview).length,
      possibleWrongClientFiles: documentResults
        .filter((document) => document.possibleWrongClient)
        .map((document) => document.originalFilename),
      possibleUnrelatedFiles: documentResults
        .filter((document) => document.possiblyUnrelated)
        .map((document) => document.originalFilename),
    },
  };

  setPlan(nextPlan);
  setStep("review");
};

`;

source = source.slice(0, handleStart) + replacement + source.slice(updateClientStart);

source = source.replace(
  'ensurePdfExtension(document.suggestedFilename)',
  'ensureOriginalExtension(document.suggestedFilename, selected.originalFilename)',
);

source = source.replace(
  'type: selected.file.type || "application/pdf",',
  'type: selected.file.type || (selected.originalFilename.toLowerCase().endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : selected.originalFilename.toLowerCase().endsWith(".doc") ? "application/msword" : "application/pdf"),',
);

source = source.replace(
  'contain PDFs. TJY AI will detect the client,',
  'contain PDFs or Word documents. TJY AI will detect the client,',
);
source = source.replace(
  'accept="application/pdf,.pdf"',
  'accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/msword,.doc"',
);
source = source.replace(
  '`${progress.current} of ${progress.total} PDFs read`',
  '`${progress.current} of ${progress.total} documents read`',
);
source = source.replace('label="PDFs"', 'label="Documents"');
source = source.replace(
  'The folders were created and every PDF was\n                uploaded under its approved name.',
  'The folders were created and every supported document was\n                uploaded under its approved name.',
);

fs.writeFileSync(filePath, source);
console.log("AI Client Import patched for PDF, DOCX, and legacy DOC handling.");
