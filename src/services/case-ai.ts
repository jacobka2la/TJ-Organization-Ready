import { supabase } from "@/lib/supabase";

export type CaseSearchResult = {
  file_id: string;
  file_name: string;
  folder_name: string | null;
  page_number: number;
  content: string;
  rank: number;
};

export type CaseAIAnswer = {
  answer: string;
  sources: CaseSearchResult[];
};

export type CaseAIMessage = {
  id: string;
  client_id: string;
  role: "user" | "assistant";
  content: string;
  sources: CaseSearchResult[];
  created_at: string;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function getIndexedFileIds(clientId: string): Promise<{
  data: string[] | null;
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from("document_pages")
    .select("file_id")
    .eq("client_id", clientId);

  if (error) {
    return {
      data: null,
      error: new Error(error.message),
    };
  }

  return {
    data: Array.from(
      new Set((data || []).map((row) => String(row.file_id))),
    ),
    error: null,
  };
}

export async function getCaseAIMessages(clientId: string): Promise<{
  data: CaseAIMessage[] | null;
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from("case_ai_messages")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  if (error) {
    return {
      data: null,
      error: new Error(error.message),
    };
  }

  return {
    data: (data || []).map((message) => ({
      ...message,
      sources: Array.isArray(message.sources)
        ? (message.sources as CaseSearchResult[])
        : [],
    })) as CaseAIMessage[],
    error: null,
  };
}

export async function saveCaseAIMessage(input: {
  clientId: string;
  role: "user" | "assistant";
  content: string;
  sources?: CaseSearchResult[];
}): Promise<{
  data: CaseAIMessage | null;
  error: Error | null;
}> {
  const { data, error } = await supabase
    .from("case_ai_messages")
    .insert({
      client_id: input.clientId,
      role: input.role,
      content: input.content,
      sources: input.sources || [],
    })
    .select()
    .single();

  if (error || !data) {
    return {
      data: null,
      error: new Error(
        error?.message || "Could not save the conversation.",
      ),
    };
  }

  return {
    data: {
      ...data,
      sources: Array.isArray(data.sources)
        ? (data.sources as CaseSearchResult[])
        : [],
    } as CaseAIMessage,
    error: null,
  };
}

export async function clearCaseAIConversation(
  clientId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("case_ai_messages")
    .delete()
    .eq("client_id", clientId);

  return {
    error: error ? new Error(error.message) : null,
  };
}

export async function searchCaseDocuments(
  clientId: string,
  question: string,
  resultLimit = 20,
): Promise<{
  data: CaseSearchResult[] | null;
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc(
    "search_case_documents",
    {
      target_client_id: clientId,
      search_query: question,
      result_limit: resultLimit,
    },
  );

  if (error) {
    return {
      data: null,
      error: new Error(error.message),
    };
  }

  return {
    data: (data || []) as CaseSearchResult[],
    error: null,
  };
}

export async function findInCaseFiles(input: {
  clientId: string;
  query: string;
}): Promise<{
  data: CaseSearchResult[] | null;
  error: Error | null;
}> {
  return searchCaseDocuments(input.clientId, input.query, 30);
}

const normalizeQuery = (value: string) =>
  value.replace(/\s+/g, " ").trim().slice(0, 1400);

const isLikelyFollowUp = (question: string) => {
  const words = question.trim().split(/\s+/).filter(Boolean);
  return (
    words.length <= 9 ||
    /\b(it|that|they|them|this|those|he|she|his|her|there|then|same|one|ones)\b/i.test(
      question,
    )
  );
};

const buildRetrievalQueries = (
  question: string,
  conversation: ConversationMessage[],
) => {
  const queries: string[] = [];
  const add = (value: string) => {
    const normalized = normalizeQuery(value);
    if (normalized && !queries.includes(normalized)) queries.push(normalized);
  };

  add(question);

  const recent = conversation.slice(-8);
  const previousUsers = recent
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);
  const previousAssistants = recent
    .filter((message) => message.role === "assistant")
    .map((message) => message.content.trim())
    .filter(Boolean);

  const previousUser = previousUsers.at(-1);
  const previousAssistant = previousAssistants.at(-1);

  if (previousUser) add(`${previousUser}\nFollow-up: ${question}`);

  if (isLikelyFollowUp(question) && previousAssistant) {
    add(`${question}\nRecent answer context: ${previousAssistant.slice(0, 700)}`);
  }

  if (previousUsers.length > 1) {
    add(`${previousUsers.slice(-2).join(" ")} ${question}`);
  }

  return queries.slice(0, 4);
};

const mergeSearchResults = (
  current: CaseSearchResult[],
  incoming: CaseSearchResult[],
) => {
  const byPage = new Map<string, CaseSearchResult>();

  [...current, ...incoming].forEach((source) => {
    const key = `${source.file_id}:${source.page_number}`;
    const existing = byPage.get(key);
    if (!existing || source.rank > existing.rank) byPage.set(key, source);
  });

  return Array.from(byPage.values())
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 24);
};

async function retrieveCaseSources(input: {
  clientId: string;
  question: string;
  conversation: ConversationMessage[];
}) {
  const queries = buildRetrievalQueries(input.question, input.conversation);
  let sources: CaseSearchResult[] = [];

  for (const query of queries) {
    const result = await searchCaseDocuments(input.clientId, query, 20);
    if (result.error) return { data: null, error: result.error };

    sources = mergeSearchResults(sources, result.data || []);

    // A solid set of pages is enough; avoid unnecessary extra database calls.
    if (sources.length >= 10) break;
  }

  return { data: sources, error: null as Error | null };
}

export async function askCaseAI(input: {
  clientId: string;
  clientName: string;
  question: string;
  conversation: ConversationMessage[];
}): Promise<{
  data: CaseAIAnswer | null;
  error: Error | null;
}> {
  const searchResponse = await retrieveCaseSources({
    clientId: input.clientId,
    question: input.question,
    conversation: input.conversation,
  });

  if (searchResponse.error) {
    return {
      data: null,
      error: searchResponse.error,
    };
  }

  const sources = searchResponse.data || [];

  if (sources.length === 0) {
    return {
      data: {
        answer:
          "I checked this client’s indexed case file and couldn’t find enough document support to answer that reliably. If this is a follow-up, try naming the document, provider, insurer, person, or issue once and I’ll keep that context for the conversation.",
        sources: [],
      },
      error: null,
    };
  }

  const { data, error } = await supabase.functions.invoke(
    "case-ai-answer",
    {
      body: {
        clientName: input.clientName,
        question: input.question,
        conversation: input.conversation.slice(-16),
        sources: sources.map((source, index) => ({
          sourceNumber: index + 1,
          fileName: source.file_name,
          folderName: source.folder_name,
          pageNumber: source.page_number,
          content: source.content,
        })),
      },
    },
  );

  if (error || !data?.answer) {
    return {
      data: null,
      error: new Error(
        data?.error ||
          error?.message ||
          "Case AI could not answer right now.",
      ),
    };
  }

  return {
    data: {
      answer: data.answer,
      sources,
    },
    error: null,
  };
}
