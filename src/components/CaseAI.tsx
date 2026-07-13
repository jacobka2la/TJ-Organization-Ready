import { useState } from "react";
import { Bot, FileSearch, LoaderCircle, Send, Sparkles } from "lucide-react";
import { askCaseAI, type CaseAIAnswer } from "@/services/case-ai";
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

const examples = [
  "What medical providers treated this client?",
  "Are there any balances or unpaid bills?",
  "Summarize the accident and injuries.",
  "What documents or information appear to be missing?",
];

export default function CaseAI({ clientId, clientName, files, onOpenSource }: Props) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<CaseAIAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [indexing, setIndexing] = useState(false);
  const [indexMessage, setIndexMessage] = useState("");

  const indexExistingFiles = async () => {
    if (indexing) return;
    const pdfs = files.filter((file) => file.storagePath && (file.type?.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")));
    if (pdfs.length === 0) {
      setIndexMessage("There are no uploaded PDFs to index yet.");
      return;
    }

    setIndexing(true);
    setError("");
    let indexed = 0;
    let scannedOrUnreadable = 0;

    for (let index = 0; index < pdfs.length; index += 1) {
      const item = pdfs[index];
      setIndexMessage(`Reading ${index + 1} of ${pdfs.length}: ${item.name}`);
      try {
        const { data, error: urlError } = await getSignedFileUrl(item.storagePath!);
        if (urlError || !data?.signedUrl) throw urlError || new Error("Could not open file.");
        const response = await fetch(data.signedUrl);
        if (!response.ok) throw new Error("Could not download file for indexing.");
        const blob = await response.blob();
        const file = new File([blob], item.name, { type: item.type || "application/pdf" });
        const result = await indexUploadedFile({ fileId: item.id, clientId, file });
        if (result.error) throw result.error;
        if (result.indexedPages > 0) indexed += 1;
        else scannedOrUnreadable += 1;
      } catch (indexError) {
        console.error("Could not index", item.name, indexError);
        scannedOrUnreadable += 1;
      }
    }

    setIndexMessage(`Finished: ${indexed} searchable PDF${indexed === 1 ? "" : "s"}${scannedOrUnreadable ? `; ${scannedOrUnreadable} scanned or unreadable` : ""}.`);
    setIndexing(false);
  };

  const submit = async (value = question) => {
    const clean = value.trim();
    if (!clean || loading) return;
    setQuestion(clean);
    setLoading(true);
    setError("");
    setResult(null);

    const response = await askCaseAI({ clientId, clientName, question: clean });
    if (response.error) setError(response.error.message);
    else setResult(response.data);
    setLoading(false);
  };

  return (
    <section className="rounded-3xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-violet-600 p-3 text-white"><Bot className="h-6 w-6" /></div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-600">TJY Case AI</p>
          <h3 className="text-2xl font-black">Ask this client’s file</h3>
          <p className="mt-1 text-sm text-slate-500">It searches this client only and shows the file and page used.</p>
        </div>
        <button
          onClick={() => void indexExistingFiles()}
          disabled={indexing}
          className="ml-auto shrink-0 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100 disabled:opacity-50"
        >
          {indexing ? "Indexing..." : "Index Existing PDFs"}
        </button>
      </div>
      {indexMessage && <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-500">{indexMessage}</p>}

      <div className="mt-5 flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
          placeholder="Ask anything about this case..."
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none focus:border-violet-500"
        />
        <button
          onClick={() => void submit()}
          disabled={loading || !question.trim()}
          className="rounded-2xl bg-violet-600 px-4 text-white hover:bg-violet-700 disabled:opacity-40"
        >
          {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>

      {!result && !loading && !error && (
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((example) => (
            <button key={example} onClick={() => void submit(example)} className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-100">
              {example}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="mt-5 flex items-center gap-2 rounded-2xl bg-white p-4 font-bold text-violet-700"><Sparkles className="h-5 w-5" /> Searching the case file...</div>}
      {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div>}

      {result && (
        <div className="mt-5 space-y-4">
          <div className="whitespace-pre-wrap rounded-2xl border border-violet-100 bg-white p-4 leading-7 text-slate-700">{result.answer}</div>
          {result.sources.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Sources</p>
              <div className="grid gap-2">
                {result.sources.slice(0, 6).map((source) => (
                  <button key={`${source.file_id}-${source.page_number}`} onClick={() => onOpenSource(source.file_id)} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left hover:border-violet-300 hover:bg-violet-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black">{source.file_name}</p>
                      <p className="text-xs text-slate-500">{source.folder_name || "Extra Files"} · Page {source.page_number}</p>
                    </div>
                    <FileSearch className="h-4 w-4 shrink-0 text-violet-600" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
