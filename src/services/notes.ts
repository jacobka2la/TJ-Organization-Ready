import { supabase } from "@/lib/supabase";

export type NoteRow = {
  id: string;
  client_id: string;
  content: string;
  completed: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getNotes() {
  return supabase
    .from("notes")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
}

export async function createNote(input: { client_id: string; content: string }) {
  return supabase
    .from("notes")
    .insert({ ...input, completed: false })
    .select()
    .single();
}

export async function updateNoteCompletion(id: string, completed: boolean) {
  return supabase
    .from("notes")
    .update({
      completed,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function softDeleteNote(id: string) {
  return supabase
    .from("notes")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function restoreNote(id: string) {
  return supabase
    .from("notes")
    .update({
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}