import { useEffect, useRef, useState } from "react";
import {
  Bot,
  FileSearch,
  LoaderCircle,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import {
  askCaseAI,
  clearCaseAIConversation,
  findInCaseFiles,
  getCaseAIMessages,
  getIndexedFileIds,
  saveCaseAIMessage,
  type CaseAIMessage,
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
  const [messages, setMessages] = useState<CaseAIMessage[]>([]);
  const [findResults, setFindResults] = useState<CaseSearchResult[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [conversationLoading, setConversationLoading] =
    useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexMessage, setIndexMessage] = useState("");
  const [error, setError] = useState("");

  const conversationEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadConversation = async () => {
      setConversationLoading(true);
      setMessages([]);
      setError("");

      const response = await getCaseAIMessages(clientId);

      if (response.error) {
        setError(response.error.message);
      } else {
        setMessages(response.data || []);
      }

      setConversationLoading(false);
    };

    void loadConversation();
  }, [clientId]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, loading]);

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
            ? `${unreadableCount} PDF${
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
    setFindResults([]);
    setError("");
  };

  const clearConversation = async () => {
    const confirmed = window.confirm(
      "Clear this AI conversation?\n\nThe AI will forget the current discussion and you can begin a new topic.",
    );

    if (!confirmed) {
      return;
    }

    setError("");

    const response = await clearCaseAIConversation(clientId);

    if (response.error) {
      setError(response.error.message);
      return;
    }

    setMessages([]);
    setQuestion("");
  };

  const submit = async (value = question) => {
    const clean = value.trim();

    if (!clean || loading || indexing) {
      return;
    }

    setQuestion("");
    setLoading(true);
    setError("");
    setFindResults([]);

    if (mode === "find") {
      const response = await findInCaseFiles({
        clientId,
        query: clean,
      });

      if (response.error) {
        setError(response.error.message);
      } else {
        setQuestion(clean);
        setFindResults(response.data || []);
      }

      setLoading(false);
      return;
    }

    const temporaryUserMessage: CaseAIMessage = {
      id: `temporary-user-${Date.now()}`,
      client_id: clientId,
      role: "user",
      content: clean,
      sources: [],
      created_at: new Date().toISOString(),
    };

    setMessages((current) => [...current, temporaryUserMessage]);

    const savedUserResponse = await saveCaseAIMessage({
      clientId,
      role: "user",
      content: clean,
    });

    if (savedUserResponse.error) {
      setError(savedUserResponse.error.message);
      setMessages((current) =>
        current.filter(
          (message) => message.id !== temporaryUserMessage.id,
        ),
      );
      setLoading(false);
      return;
    }

    const conversationHistory = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const aiResponse = await askCaseAI({
      clientId,
      clientName,
      question: clean,
      conversation: conversationHistory,
    });

    if (aiResponse.error || !aiResponse.data) {
      setError(
        aiResponse.error?.message ||
          "Case AI could not answer right now.",
      );

      setMessages((current) =>
        current.map((message) =>
          message.id === temporaryUserMessage.id &&
          savedUserResponse.data
            ? savedUserResponse.data
            : message,
        ),
      );

      setLoading(false);
      return;
    }

    const savedAssistantResponse = await saveCaseAIMessage({
      clientId,
      role: "assistant",
      content: aiResponse.data.answer,
      sources: aiResponse.data.sources,
    });

    setMessages((current) => {
      const withoutTemporary = current.filter(
        (message) => message.id !== temporaryUserMessage.id,
      );

      const savedUser = savedUserResponse.data
        ? [savedUserResponse.data]
        : [temporaryUserMessage];

      const assistantMessage: CaseAIMessage =
        savedAssistantResponse.data || {
          id: `temporary-assistant-${Date.now()}`,
          client_id: clientId,
          role: "assistant",
          content: aiResponse.data!.answer,
          sources: aiResponse.data!.sources,
          created_at: new Date().toISOString(),
        };

      return [
        ...withoutTemporary,
        ...savedUser,
        assistantMessage,
      ];
    });

    if (savedAssistantResponse.error) {
      console.warn(
        "Answer displayed but could not be saved:",
        savedAssistantResponse.error,
      );
    }

    setLoading(false);
  };

  const examples = mode === "ask" ? askExamples : findExamples;

  return (
    <section className="rounded-3xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
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
                ? "Case conversation"
                : "Find in this client’s files"}
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              {mode === "ask"
                ? "Ask follow-up questions. The conversation is saved until you clear it."
                : "Find relevant filenames, pages, and matching passages."}
            </p>
          </div>
        </div>

        {mode === "ask" && messages.length > 0 && (
          <button
            onClick={() => void clearConversation()}
            disabled={loading}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
            Clear Conversation
          </button>
        )}
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

      {mode === "ask" && (
        <div className="mt-4 max-h-[560px] space-y-4 overflow-y-auto rounded-2xl border border-violet-100 bg-white/70 p-4">
          {conversationLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-violet-600">
              <LoaderCircle className="h-5 w-5 animate-spin" />
              Loading conversation...
            </div>
          ) : messages.length === 0 ? (
            <div className="py-8 text-center">
              <MessageCircle className="mx-auto h-9 w-9 text-violet-300" />
              <p className="mt-3 font-black text-slate-700">
                Start a new conversation
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Ask about providers, bills, treatment, injuries,
                insurance, discovery, or any other current case file.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <ConversationMessage
                key={message.id}
                message={message}
                onOpenSource={onOpenSource}
              />
            ))
          )}

          {loading && (
            <div className="flex items-center gap-2 rounded-2xl bg-violet-50 p-4 font-bold text-violet-700">
              <Sparkles className="h-5 w-5" />
              Reviewing the current case files...
            </div>
          )}

          <div ref={conversationEndRef} />
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
              ? messages.length > 0
                ? "Ask a follow-up question..."
                : "Ask anything about this case..."
              : "Search for pain, providers, insurance, statements..."
          }
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-semibold outline-none focus:border-violet-500"
        />

        <button
          onClick={() => void submit()}
          disabled={
            loading ||
            indexing ||
            conversationLoading ||
            !question.trim()
          }
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

      {mode === "ask" &&
        messages.length === 0 &&
        !conversationLoading &&
        !loading && (
          <div className="mt-3 flex flex-wrap gap-2">
            {askExamples.map((example) => (
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

      {mode === "find" &&
        findResults.length === 0 &&
        !loading &&
        !error && (
          <div className="mt-3 flex flex-wrap gap-2">
            {findExamples.map((example) => (
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

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
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

function ConversationMessage({
  message,
  onOpenSource,
}: {
  message: CaseAIMessage;
  onOpenSource: (fileId: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="mt-1 h-fit rounded-xl bg-violet-600 p-2 text-white">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div
        className={`max-w-[88%] rounded-2xl p-4 ${
          isUser
            ? "bg-violet-600 text-white"
            : "border border-slate-200 bg-white text-slate-700"
        }`}
      >
        <div className="whitespace-pre-wrap text-sm leading-7">
          {message.content}
        </div>

        {!isUser && message.sources.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              Current Sources
            </p>

            <div className="flex flex-wrap gap-2">
              {message.sources.slice(0, 8).map((source) => (
                <button
                  key={`${message.id}-${source.file_id}-${source.page_number}`}
                  onClick={() => onOpenSource(source.file_id)}
                  className="rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-1.5 text-left text-[11px] font-bold text-violet-700 hover:bg-violet-100"
                >
                  {source.file_name} · p. {source.page_number}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isUser && (
        <div className="mt-1 h-fit rounded-xl bg-slate-200 p-2 text-slate-600">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}