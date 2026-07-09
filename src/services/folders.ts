import { supabase } from "@/lib/supabase";

export type FolderRow = {
  id: string;
  client_id: string;
  name: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getFolders() {
  return supabase.from("folders").select("*").is("deleted_at", null).order("created_at", { ascending: true });
}

export async function createFolder(input: { client_id: string; name: string }) {
  return supabase.from("folders").insert(input).select().single();
}

export async function softDeleteFolder(id: string) {
  return supabase.from("folders").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
}
