import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  FileText,
  FolderInput,
  LoaderCircle,
  Sparkles,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createClient } from "@/services/clients";
import { createFolder } from "@/services/folders";
import { uploadClientFile } from "@/services/files";


const ALLOWED_FOLDERS = [
  "Client Intake",
  "Application for Benefits",
  "Authorizations",
  "Correspondence",
  "Insurance and Claims",
  "Medical Records",
  "Medical Bills",
  "IME",
  "Liens",
  "Employment and Wage Loss",
  "Police and Incident Reports",
  "Photos and Evidence",
  "Pleadings",
  "Discovery",
  "Return of Service",
  "Court Orders and Notices",
  "Settlement and Release",
  "Social Security",
  "Expenses",
  "Needs Review",
] as const;

type AllowedFolder = (typeof ALLOWED_FOLDERS)[number];

type ImportDocumentPlan = {
  originalFilename: string;
  documentType: string;
  suggestedFolder: AllowedFolder;
  suggestedFilename: string;
  confidence: number;
  needsReview: boolean;
  reason: string;
  clientNamesFound?: string[];
  providerOrOrganization?: string | null;
  importantDateStart?: string | null;
  importantDateEnd?: string | null;
  includeDateInFilename?: boolean;
  possibleWrongClient?: boolean;
  possiblyUnrelated?: boolean;
};

type ImportPlan = {
  client: {
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    dateOfBirth: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    caseType: "Personal Injury" | "Social Security" | "Both" | "Unknown";
    confidence: number;
    needsReview: boolean;
    reason: string;
  };
  foldersToCreate: AllowedFolder[];
  documents: ImportDocumentPlan[];
  summary?: {
    totalDocuments: number;
    readyToImport: number;
    needsReview: number;
    possibleWrongClientFiles: string[];
    possibleUnrelatedFiles: string[];
  };
};

type SelectedPdf = {
  file: File;
  originalFilename: string;
  pdfBase64: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete: (clientId: string) => Promise<void> | void;
};

type Step =
  | "select"
  | "reading"
  | "analyzing"
  | "review"
  | "importing"
  | "complete";

const ensurePdfExtension = (name: string) => {
  const clean = name.trim().replace(/\.pdf$/i, "");
  return `${clean || "Untitled Document"}.pdf`;
};

const splitFullName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) || "",
  };
};

async function fileToBase64(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`Could not read ${file.name}.`));
        return;
      }

      const base64 = reader.result.split(",")[1];

      if (!base64) {
        reject(new Error(`Could not convert ${file.name} to base64.`));
        return;
      }

      resolve(base64);
    };

    reader.onerror = () => {
      reject(
        reader.error ||
          new Error(`Could not read ${file.name}.`),
      );
    };

    reader.readAsDataURL(file);
  });
}

export default function AIClientImport({
  open,
  onClose,
  onComplete,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("select");
  const [folderName, setFolderName] = useState("");
  const [selectedPdfs, setSelectedPdfs] = useState<SelectedPdf[]>([]);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    label: "",
  });
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  const folderInputProps = {
    webkitdirectory: "",
    directory: "",
  } as React.InputHTMLAttributes<HTMLInputElement>;

  const reviewCount = useMemo(
    () =>
      plan?.documents.filter((document) => document.needsReview).length || 0,
    [plan],
  );

  const reset = () => {
    setStep("select");
    setFolderName("");
    setSelectedPdfs([]);
    setPlan(null);
    setError("");
    setProgress({
      current: 0,
      total: 0,
      label: "",
    });
    setCreatedClientId(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const close = () => {
    if (
      step === "reading" ||
      step === "analyzing" ||
      step === "importing"
    ) {
      return;
    }

    reset();
    onClose();
  };

 const handleFolderSelection = async (
  event: React.ChangeEvent<HTMLInputElement>,
) => {
  const files = Array.from(event.target.files || []);

  const pdfFiles = files.filter(
    (file) =>
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf"),
  );

  if (pdfFiles.length === 0) {
    setError("That folder does not contain any PDFs.");
    return;
  }

  const relativePath =
    (pdfFiles[0] as File & { webkitRelativePath?: string })
      .webkitRelativePath || "";

  const detectedFolderName =
    relativePath.split("/")[0] || "Imported Client";

  setError("");
  setFolderName(detectedFolderName);
  setStep("reading");

  setProgress({
    current: 0,
    total: pdfFiles.length,
    label: "Reading PDFs",
  });

  const preparedPdfs: SelectedPdf[] = [];

  for (let index = 0; index < pdfFiles.length; index += 1) {
    const file = pdfFiles[index];

    setProgress({
      current: index + 1,
      total: pdfFiles.length,
      label: `Reading ${file.name}`,
    });

    try {
      const pdfBase64 = await fileToBase64(file);

      preparedPdfs.push({
        file,
        originalFilename: file.name,
        pdfBase64,
      });
    } catch (fileError) {
      console.error("Could not read PDF:", file.name, fileError);

      setError(
        fileError instanceof Error
          ? fileError.message
          : `Could not read ${file.name}.`,
      );

      setStep("select");
      return;
    }
  }

  setSelectedPdfs(preparedPdfs);

  await analyzeFolder(
    detectedFolderName,
    preparedPdfs,
  );
};

const analyzeFolder = async (
  name: string,
  pdfs: SelectedPdf[],
) => {
  setStep("analyzing");
  setError("");

  const documentResults: ImportDocumentPlan[] = [];

  for (let index = 0; index < pdfs.length; index += 1) {
    const pdf = pdfs[index];

    setProgress({
      current: index + 1,
      total: pdfs.length,
      label: `Analyzing ${pdf.originalFilename}`,
    });

    const { data, error: invokeError } =
      await supabase.functions.invoke(
        "ai-classify-document",
        {
          body: {
            originalFilename: pdf.originalFilename,
            pdfBase64: pdf.pdfBase64,
          },
        },
      );

    if (
      invokeError ||
      !data?.success ||
      !data?.classification
    ) {
      console.error(
        "Document classification failed:",
        pdf.originalFilename,
        invokeError,
        data,
      );

      documentResults.push({
        originalFilename: pdf.originalFilename,
        documentType: "Classification Failed",
        suggestedFolder: "Needs Review",
        suggestedFilename:
          pdf.originalFilename.replace(/\.pdf$/i, ""),
        confidence: 0,
        needsReview: true,
        reason:
          data?.error ||
          invokeError?.message ||
          "The PDF could not be classified.",
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
      originalFilename: pdf.originalFilename,
      ...data.classification,
    });
  }

  const fallbackName = splitFullName(
    name.replace(/[_-]+/g, " "),
  );

  const foundClientNames = documentResults
    .flatMap((document) => document.clientNamesFound || [])
    .filter(Boolean);

  const mostCommonClientName =
    foundClientNames.length > 0
      ? foundClientNames
          .sort(
            (a, b) =>
              foundClientNames.filter((name) => name === b)
                .length -
              foundClientNames.filter((name) => name === a)
                .length,
          )[0]
      : null;

  const detectedName = mostCommonClientName
    ? splitFullName(mostCommonClientName)
    : fallbackName;

  const foldersToCreate = ALLOWED_FOLDERS.filter(
    (folder) =>
      documentResults.some(
        (document) =>
          document.suggestedFolder === folder,
      ),
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
      readyToImport: documentResults.filter(
        (document) => !document.needsReview,
      ).length,
      needsReview: documentResults.filter(
        (document) => document.needsReview,
      ).length,
      possibleWrongClientFiles: documentResults
        .filter(
          (document) => document.possibleWrongClient,
        )
        .map(
          (document) => document.originalFilename,
        ),
      possibleUnrelatedFiles: documentResults
        .filter(
          (document) => document.possiblyUnrelated,
        )
        .map(
          (document) => document.originalFilename,
        ),
    },
  };

  setPlan(nextPlan);
  setStep("review");
};

  const updateClient = (
    field: keyof ImportPlan["client"],
    value: string | boolean | number | null,
  ) => {
    setPlan((current) =>
      current
        ? {
            ...current,
            client: {
              ...current.client,
              [field]: value,
            },
          }
        : current,
    );
  };

  const updateDocument = (
    index: number,
    changes: Partial<ImportDocumentPlan>,
  ) => {
    setPlan((current) => {
      if (!current) {
        return current;
      }

      const documents = current.documents.map(
        (document, documentIndex) =>
          documentIndex === index
            ? {
                ...document,
                ...changes,
              }
            : document,
      );

      const foldersToCreate = ALLOWED_FOLDERS.filter((folder) =>
        documents.some(
          (document) => document.suggestedFolder === folder,
        ),
      );

      return {
        ...current,
        documents,
        foldersToCreate,
      };
    });
  };

  const finalizeImport = async () => {
    if (!plan) {
      return;
    }

    if (
      !plan.client.firstName?.trim() &&
      !plan.client.lastName?.trim()
    ) {
      setError("Confirm the client's name before importing.");
      return;
    }

    setError("");
    setStep("importing");

    setProgress({
      current: 0,
      total:
        plan.documents.length +
        plan.foldersToCreate.length +
        1,
      label: "Creating client",
    });

    const { data: clientRow, error: clientError } =
      await createClient({
        first_name: plan.client.firstName?.trim() || "",
        last_name: plan.client.lastName?.trim() || "",
        phone_number: plan.client.phone || "",
        email: plan.client.email || "",
        date_of_birth: plan.client.dateOfBirth || "",
        case_type:
          plan.client.caseType === "Unknown"
            ? ""
            : plan.client.caseType,
        status: "Active",
      });

    if (clientError || !clientRow) {
      setError(
        clientError?.message || "Could not create the client.",
      );
      setStep("review");
      return;
    }

    const clientId = clientRow.id;
    const folderIds = new Map<string, string>();

    let completed = 1;

    for (const folder of plan.foldersToCreate) {
      setProgress({
        current: completed,
        total:
          plan.documents.length +
          plan.foldersToCreate.length +
          1,
        label: `Creating ${folder}`,
      });

      const { data: folderRow, error: folderError } =
        await createFolder({
          client_id: clientId,
          name: folder,
        });

      if (folderError || !folderRow) {
        setError(
          folderError?.message ||
            `Could not create ${folder}.`,
        );
        setStep("review");
        return;
      }

      folderIds.set(folder, folderRow.id);
      completed += 1;
    }

    for (
      let index = 0;
      index < plan.documents.length;
      index += 1
    ) {
      const document = plan.documents[index];

      const selected = selectedPdfs.find(
        (pdf) =>
          pdf.originalFilename === document.originalFilename,
      );

      if (!selected) {
        continue;
      }

      const folderId =
        folderIds.get(document.suggestedFolder) ||
        folderIds.get("Needs Review");

      if (!folderId) {
        setError(
          `No destination folder was created for ${document.originalFilename}.`,
        );
        setStep("review");
        return;
      }

      setProgress({
        current: completed,
        total:
          plan.documents.length +
          plan.foldersToCreate.length +
          1,
        label: `Uploading ${document.suggestedFilename}`,
      });

      const renamedFile = new File(
        [selected.file],
        ensurePdfExtension(document.suggestedFilename),
        {
          type: selected.file.type || "application/pdf",
          lastModified: selected.file.lastModified,
        },
      );

      const { error: uploadError } = await uploadClientFile({
        clientId,
        folderId,
        file: renamedFile,
      });

      if (uploadError) {
        setError(
          uploadError.message ||
            `Could not upload ${document.originalFilename}.`,
        );
        setStep("review");
        return;
      }

      completed += 1;
    }

    setCreatedClientId(clientId);

    setProgress({
      current: completed,
      total: completed,
      label: "Import complete",
    });

    setStep("complete");
    await onComplete(clientId);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 md:px-7">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
              <Sparkles className="h-6 w-6" />
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-600">
                TJY AI
              </p>

              <h2 className="text-2xl font-black">
                Import Client Folder
              </h2>
            </div>
          </div>

          <button
            onClick={close}
            disabled={
              step === "reading" ||
              step === "analyzing" ||
              step === "importing"
            }
            className="rounded-2xl border border-slate-200 p-3 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 md:p-7">
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === "select" && (
            <div className="mx-auto max-w-2xl py-8 text-center">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[2rem] bg-violet-100 text-violet-700">
                <FolderInput className="h-11 w-11" />
              </div>

              <h3 className="mt-6 text-4xl font-black">
                Choose the messy client folder
              </h3>

              <p className="mx-auto mt-3 max-w-xl text-slate-500">
                The folder should be named after the client and
                contain PDFs. TJY AI will detect the client,
                create the folders, rename the documents, and
                organize everything.
              </p>

              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                {...folderInputProps}
                onChange={handleFolderSelection}
                className="hidden"
              />

              <button
                onClick={() => inputRef.current?.click()}
                className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-7 py-4 font-black text-white hover:bg-violet-700"
              >
                <FolderInput className="h-5 w-5" />
                Select Client Folder
              </button>

              <p className="mt-4 text-xs font-bold text-slate-400">
                Original files on the computer are never deleted
                or changed.
              </p>
            </div>
          )}

          {(step === "reading" ||
            step === "analyzing" ||
            step === "importing") && (
            <div className="mx-auto max-w-2xl py-16 text-center">
              <LoaderCircle className="mx-auto h-14 w-14 animate-spin text-violet-600" />

              <h3 className="mt-6 text-3xl font-black">
                {progress.label}
              </h3>

              <p className="mt-2 text-slate-500">
                {step === "reading" &&
                  `${progress.current} of ${progress.total} PDFs read`}

                {step === "analyzing" &&
                  "Comparing the documents and building the client file."}

                {step === "importing" &&
                  `${progress.current} of ${progress.total} steps complete`}
              </p>

              <div className="mt-7 h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-violet-600 transition-all"
                  style={{
                    width: `${Math.max(
                      5,
                      (progress.current /
                        Math.max(progress.total, 1)) *
                        100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {step === "review" && plan && (
            <div>
              <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-600">
                    Detected Client
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-xs font-black text-slate-500">
                        First Name
                      </span>

                      <input
                        value={plan.client.firstName || ""}
                        onChange={(event) =>
                          updateClient(
                            "firstName",
                            event.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-bold outline-none focus:border-violet-500"
                      />
                    </label>

                    <label>
                      <span className="mb-1 block text-xs font-black text-slate-500">
                        Last Name
                      </span>

                      <input
                        value={plan.client.lastName || ""}
                        onChange={(event) =>
                          updateClient(
                            "lastName",
                            event.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-bold outline-none focus:border-violet-500"
                      />
                    </label>

                    <label>
                      <span className="mb-1 block text-xs font-black text-slate-500">
                        Date of Birth
                      </span>

                      <input
                        type="date"
                        value={plan.client.dateOfBirth || ""}
                        onChange={(event) =>
                          updateClient(
                            "dateOfBirth",
                            event.target.value || null,
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-bold outline-none focus:border-violet-500"
                      />
                    </label>

                    <label>
                      <span className="mb-1 block text-xs font-black text-slate-500">
                        Case Type
                      </span>

                      <select
                        value={plan.client.caseType}
                        onChange={(event) =>
                          updateClient(
                            "caseType",
                            event.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-bold outline-none focus:border-violet-500"
                      >
                        <option>Personal Injury</option>
                        <option>Social Security</option>
                        <option>Both</option>
                        <option>Unknown</option>
                      </select>
                    </label>
                  </div>

                  <p className="mt-4 rounded-2xl bg-white p-3 text-sm text-slate-600">
                    {plan.client.reason}
                  </p>
                </section>

                <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryCard
                    label="PDFs"
                    value={plan.documents.length}
                  />

                  <SummaryCard
                    label="Folders"
                    value={plan.foldersToCreate.length}
                  />

                  <SummaryCard
                    label="Ready"
                    value={
                      plan.documents.length - reviewCount
                    }
                  />

                  <SummaryCard
                    label="Needs Review"
                    value={reviewCount}
                    warning={reviewCount > 0}
                  />
                </section>
              </div>

              <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                  <h3 className="text-xl font-black">
                    Document Plan
                  </h3>

                  <p className="text-sm text-slate-500">
                    Change any folder or filename before
                    importing.
                  </p>
                </div>

                <div className="divide-y divide-slate-200">
                  {plan.documents.map(
                    (document, index) => (
                      <div
                        key={`${document.originalFilename}-${index}`}
                        className="grid gap-3 p-4 lg:grid-cols-[1.1fr_1fr_1fr_auto] lg:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-slate-400" />

                            <p className="truncate text-sm font-black">
                              {document.originalFilename}
                            </p>
                          </div>

                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                            {document.reason}
                          </p>
                        </div>

                        <select
                          value={document.suggestedFolder}
                          onChange={(event) =>
                            updateDocument(index, {
                              suggestedFolder:
                                event.target
                                  .value as AllowedFolder,
                              needsReview:
                                event.target.value ===
                                "Needs Review",
                            })
                          }
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-violet-500"
                        >
                          {ALLOWED_FOLDERS.map((folder) => (
                            <option key={folder}>
                              {folder}
                            </option>
                          ))}
                        </select>

                        <input
                          value={document.suggestedFilename}
                          onChange={(event) =>
                            updateDocument(index, {
                              suggestedFilename:
                                event.target.value,
                            })
                          }
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-violet-500"
                        />

                        <div
                          className={`rounded-full px-3 py-1.5 text-center text-xs font-black ${
                            document.needsReview
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {Math.round(
                            Number(
                              document.confidence || 0,
                            ) * 100,
                          )}
                          %
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          )}

          {step === "complete" && (
            <div className="mx-auto max-w-xl py-16 text-center">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="h-12 w-12" />
              </div>

              <h3 className="mt-6 text-4xl font-black">
                Client file created
              </h3>

              <p className="mt-3 text-slate-500">
                The folders were created and every PDF was
                uploaded under its approved name.
              </p>
            </div>
          )}
        </div>

        {(step === "review" || step === "complete") && (
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-between md:px-7">
            {step === "review" ? (
              <>
                <button
                  onClick={reset}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-600 hover:border-slate-300"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Choose Another Folder
                </button>

                <button
                  onClick={finalizeImport}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 py-3 font-black text-white hover:bg-violet-700"
                >
                  <Sparkles className="h-5 w-5" />
                  Create Client and Organize Files
                </button>
              </>
            ) : (
              <button
                onClick={close}
                className="ml-auto rounded-2xl bg-blue-600 px-6 py-3 font-black text-white hover:bg-blue-700"
              >
                Open Client File
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-4 ${
        warning
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-3xl font-black">{value}</p>

      <p
        className={`mt-1 text-xs font-black uppercase tracking-[0.12em] ${
          warning
            ? "text-amber-700"
            : "text-slate-500"
        }`}
      >
        {label}
      </p>
    </div>
  );
}