import { useEffect, useState } from "react";
import {
  Bot,
  FileSearch,
  LoaderCircle,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import {
  askCaseAI,
  findInCaseFiles,
  getIndexedFileIds,
  type CaseAIAnswer,
  type CaseSearchResult,
} from "@/services/case-ai";
import { getSignedFileUrl } from "@/services/files";
import { indexUploadedFile } from "@/services/document-index";

type SearchableFile = {
  id: string;
  name: string;
  storagePath?: string;
  type?: string;
};

type Props = {
  clientId: string;
  clientName: string;
  files: SearchableFile[];
  onOpenSource: (fileId: string) => void;
};

type Mode = "ask" | "find";

const askExamples = [
  "How many medical providers treated this client?",
  "Summarize the accident and injuries.",
  "Are there unpaid medical bills or balances?",
  "Build a timeline of the client’s treatment.",
];

const findExamples = [
  "Every mention of headaches",
  "Progressive insurance",
  "Shoulder pain",
  "Physical therapy records",
];

const isPdf = (file: SearchableFile) =>
  Boolean(
    file.storagePath &&
      (file.type?.toLowerCase().includes("pdf") ||
        file.name.toLowerCase().endsWith(".pdf")),
  );

const createSnippet = (content: string, query: string) => {
  const cleanContent = content.replace(/\s+/g, " ").trim();

  if (cleanContent.length <= 420) {
    return cleanContent;
  }

  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);

  const lowerContent = cleanContent.toLowerCase();

  const matchIndex = words
    .map((word) => lowerContent.indexOf(word))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (matchIndex === undefined) {
    return `${cleanContent.slice(0, 420)}…`;
  }

  const start = Math.max(0, matchIndex - 140);
  const end = Math.min(cleanContent.length, start + 420);

  return `${start > 0 ? "…" : ""}${cleanContent.slice(start, end)}${
    end < cleanContent.length ? "…" : ""
  }`;
};

export default function CaseAI({
  clientId,
  clientName,
  files,
  onOpenSource,
}: Props) {
  const [mode, setMode] = useState<Mode>("ask");
  const [question, setQuestion] = useState("");
  const [answerResult, setAnswerResult] =
    useState<CaseAIAnswer | null>(null);
  const [findResults, setFindResults] = useState<CaseSearchResult[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexMessage, setIndexMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
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
          const item = missingPdfs[index];

          setIndexMessage(
            `Preparing file ${index + 1} of ${missingPdfs.length}...`,
          );

          try {
            const { data, error: urlError } =
              await getSignedFileUrl(item.storagePath!);

            if (urlError || !data?.signedUrl) {
              throw (
                urlError ||
                new Error("Could not open the uploaded PDF.")
              );
            }

            const response = await fetch(data.signedUrl);

            if (!response.ok) {
              throw new Error("Could not download the PDF.");
            }

            const blob = await response.blob();

            const localFile = new File([blob], item.name, {
              type: item.type || "application/pdf",
            });

            const indexResult = await indexUploadedFile({
              fileId: item.id,
              clientId,
              file: localFile,
            });

            if (indexResult.error) {
              throw indexResult.error;
            }

            if (indexResult.indexedPages === 0) {
              unreadableCount += 1;
            }
          } catch (fileError) {
            console.error(
              `Could not index ${item.name}:`,
              fileError,
            );
            unreadableCount += 1;
          }
        }

        setIndexMessage(
          unreadableCount > 0
            ? `${unreadableCount} scanned or unreadable PDF${
                unreadableCount === 1 ? "" : "s"
              } could not be searched.`
            : "",
        );
      } catch (indexError) {
        console.error("Automatic indexing failed:", indexError);
        setIndexMessage(
          "Some uploaded PDFs could not be prepared for search.",
        );
      } finally {
        setIndexing(false);
      }
    };

    void automaticallyIndexMissingPdfs();
  }, [clientId, files]);

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setAnswerResult(null);
    setFindResults([]);
    setError("");
  };

  const submit = async (value = question) => {
    const clean = value.trim();

    if (!clean || loading || indexing) {
      return;
    }

    setQuestion(clean);
    setLoading(true);
    setError("");
    setAnswerResult(null);
    setFindResults([]);

    if (mode === "ask") {
      const response = await askCaseAI({
        clientId,
        clientName,
        question: clean,
      });

      if (response.error) {
        setError(response.error.message);
      } else {
        setAnswerResult(response.data);
      }
    } else {
      const response = await findInCaseFiles({
        clientId,
        query: clean,
      });

      if (response.error) {
        setError(response.error.message);
      } else {
        setFindResults(response.data || []);
      }
    }

    setLoading(false);
  };

  const examples = mode === "ask" ? askExamples : findExamples;

  return (
    <section className="rounded-3xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-violet-600 p-3 text-white">
          {mode === "ask" ? (
            <Bot className="h-6 w-6" />
          ) : (
            <Search className="h-6 w-6" />
          )}
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-600">
            TJY Case AI
          </p>

          <h3 className="text-2xl font-black">
            {mode === "ask"
              ? "Ask this client’s file"
              : "Find in this client’s files"}
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            {mode === "ask"
              ? "Get an answer based only on this client’s documents."
              : "Find every relevant filename, page, and matching passage."}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 rounded-2xl bg-violet-100 p-1">
        <button
          onClick={() => changeMode("ask")}
          className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
            mode === "ask"
              ? "bg-white text-violet-700 shadow-sm"
              : "text-violet-500 hover:text-violet-700"
          }`}
        >
          Ask AI
        </button>

        <button
          onClick={() => changeMode("find")}
          className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
            mode === "find"
              ? "bg-white text-violet-700 shadow-sm"
              : "text-violet-500 hover:text-violet-700"
          }`}
        >
          Find in Files
        </button>
      </div>

      {(indexing || indexMessage) && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-500">
          {indexing && (
            <LoaderCircle className="h-4 w-4 animate-spin text-violet-600" />
          )}
          <span>{indexMessage}</span>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void submit();
            }
          }}
          placeholder={
            mode === "ask"
              ? "Ask anything about this case..."
              : "Search for pain, providers, insurance, statements..."
          }
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none focus:border-violet-500"
        />

        <button
          onClick={() => void submit()}
          disabled={loading || indexing || !question.trim()}
          className="rounded-2xl bg-violet-600 px-4 text-white hover:bg-violet-700 disabled:opacity-40"
        >
          {loading ? (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          ) : mode === "ask" ? (
            <Send className="h-5 w-5" />
          ) : (
            <Search className="h-5 w-5" />
          )}
        </button>
      </div>

      {!answerResult &&
        findResults.length === 0 &&
        !loading &&
        !error && (
          <div className="mt-3 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                onClick={() => void submit(example)}
                disabled={indexing}
                className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-40"
              >
                {example}
              </button>
            ))}
          </div>
        )}

      {loading && (
        <div className="mt-5 flex items-center gap-2 rounded-2xl bg-white p-4 font-bold text-violet-700">
          <Sparkles className="h-5 w-5" />
          {mode === "ask"
            ? "Reviewing the case file..."
            : "Searching every indexed page..."}
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {mode === "ask" && answerResult && (
        <div className="mt-5 space-y-4">
          <div className="whitespace-pre-wrap rounded-2xl border border-violet-100 bg-white p-4 leading-7 text-slate-700">
            {answerResult.answer}
          </div>

          {answerResult.sources.length > 0 && (
            <SourceButtons
              sources={answerResult.sources}
              onOpenSource={onOpenSource}
            />
          )}
        </div>
      )}

      {mode === "find" &&
        !loading &&
        question.trim() &&
        findResults.length === 0 &&
        !error && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500">
            No matching passages were found in this client’s
            searchable PDFs.
          </div>
        )}

      {mode === "find" && findResults.length > 0 && (
        <div className="mt-5">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            {findResults.length} matching page
            {findResults.length === 1 ? "" : "s"}
          </p>

          <div className="grid gap-3">
            {findResults.map((source) => (
              <button
                key={`${source.file_id}-${source.page_number}`}
                onClick={() => onOpenSource(source.file_id)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-violet-300 hover:bg-violet-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-800">
                      {source.file_name}
                    </p>

                    <p className="mt-1 text-xs font-bold text-violet-600">
                      {source.folder_name || "Extra Files"} · Page{" "}
                      {source.page_number}
                    </p>
                  </div>

                  <FileSearch className="h-5 w-5 shrink-0 text-violet-600" />
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {createSnippet(source.content, question)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SourceButtons({
  sources,
  onOpenSource,
}: {
  sources: CaseSearchResult[];
  onOpenSource: (fileId: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">
        Sources
      </p>

      <div className="grid gap-2">
        {sources.slice(0, 10).map((source) => (
          <button
            key={`${source.file_id}-${source.page_number}`}
            onClick={() => onOpenSource(source.file_id)}
            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left hover:border-violet-300 hover:bg-violet-50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black">
                {source.file_name}
              </p>

              <p className="text-xs text-slate-500">
                {source.folder_name || "Extra Files"} · Page{" "}
                {source.page_number}
              </p>
            </div>

            <FileSearch className="h-4 w-4 shrink-0 text-violet-600" />
          </button>
        ))}
      </div>
    </div>
  );
}