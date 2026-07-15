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

export async function askCaseAI(input: {
  clientId: string;
  clientName: string;
  question: string;
  conversation: ConversationMessage[];
}): Promise<{
  data: CaseAIAnswer | null;
  error: Error | null;
}> {
  const searchResponse = await searchCaseDocuments(
    input.clientId,
    input.question,
    20,
  );

  if (searchResponse.error) {
    return {
      data: null,
      error: searchResponse.error,
    };
  }

  const sources = searchResponse.data || [];

  /*
   * Follow-up questions such as "did they pay it?" may not contain
   * enough useful search words. When that happens, the Edge Function
   * still receives the conversation, but it must not treat prior AI
   * answers as proof.
   */
  if (sources.length === 0) {
    return {
      data: {
        answer:
          "I couldn’t find current case-file support for that answer. Try including the provider, document, injury, or insurance company you’re referring to.",
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