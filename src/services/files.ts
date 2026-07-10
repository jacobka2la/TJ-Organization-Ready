import { supabase } from "@/lib/supabase";

const BUCKET = "client-files";

export type FileRow = {
  id: string;
  client_id: string;
  folder_id: string | null;
  name: string;
  storage_path: string;
  file_type: string | null;
  file_size: number | null;
  is_extra_file: boolean | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getFiles() {
  return supabase.from("files").select("*").is("deleted_at", null).order("created_at", { ascending: false });
}

export async function uploadClientFile(input: { clientId: string; folderId?: string | null; file: File; isExtraFile?: boolean }) {
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const folderPart = input.isExtraFile ? "extra-files" : input.folderId || "folder-files";
  const path = `${input.clientId}/${folderPart}/${crypto.randomUUID()}-${safeName}`;
  const uploadResult = await supabase.storage.from(BUCKET).upload(path, input.file, { upsert: false });
  if (uploadResult.error) return { data: null, error: uploadResult.error };
  return supabase.from("files").insert({
    client_id: input.clientId,
    folder_id: input.isExtraFile ? null : input.folderId || null,
    name: input.file.name,
    storage_path: path,
    file_type: input.file.type || null,
    file_size: input.file.size,
    is_extra_file: Boolean(input.isExtraFile),
  }).select().single();
}

export async function getSignedFileUrl(storagePath: string) {
  return supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
}

export async function softDeleteFile(id: string) {
  return supabase.from("files").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
}

export async function renameFile(id: string, name: string) {
  return supabase
    .from("files")
    .update({
      name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
}

