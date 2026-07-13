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

export async function searchCaseDocuments(clientId: string, question: string) {
  return supabase.rpc("search_case_documents", {
    target_client_id: clientId,
    search_query: question,
    result_limit: 10,
  });
}

export async function askCaseAI(input: {
  clientId: string;
  clientName: string;
  question: string;
}): Promise<{ data: CaseAIAnswer | null; error: Error | null }> {
  const { data: matches, error: searchError } = await searchCaseDocuments(
    input.clientId,
    input.question,
  );

  if (searchError) return { data: null, error: new Error(searchError.message) };
  const sources = (matches || []) as CaseSearchResult[];

  if (sources.length === 0) {
    return {
      data: {
        answer: "I couldn't find that in the searchable text for this client's files. The information may be in a scanned PDF that has no selectable text, or the document may not be uploaded yet.",
        sources: [],
      },
      error: null,
    };
  }

  const { data, error } = await supabase.functions.invoke("case-ai-answer", {
    body: {
      clientName: input.clientName,
      question: input.question,
      sources: sources.map((source, index) => ({
        sourceNumber: index + 1,
        fileName: source.file_name,
        folderName: source.folder_name,
        pageNumber: source.page_number,
        content: source.content,
      })),
    },
  });

  if (error || !data?.answer) {
    return {
      data: null,
      error: new Error(data?.error || error?.message || "Case AI could not answer right now."),
    };
  }

  return { data: { answer: data.answer, sources }, error: null };
}
