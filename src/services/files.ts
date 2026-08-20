import { supabase } from "@/lib/supabase";

const BUCKET = "client-files";
const FILE_PAGE_SIZE = 500;

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
  const allFiles: FileRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("files")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + FILE_PAGE_SIZE - 1);

    if (error) return { data: null, error };

    const page = (data || []) as FileRow[];
    allFiles.push(...page);

    if (page.length < FILE_PAGE_SIZE) break;
    from += FILE_PAGE_SIZE;
  }

  return { data: allFiles, error: null };
}

export async function uploadClientFile(input: {
  clientId: string;
  folderId?: string | null;
  file: File;
  isExtraFile?: boolean;
}) {
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const folderPart = input.isExtraFile
    ? "extra-files"
    : input.folderId || "folder-files";
  const path = `${input.clientId}/${folderPart}/${crypto.randomUUID()}-${safeName}`;

  const uploadResult = await supabase.storage
    .from(BUCKET)
    .upload(path, input.file, { upsert: false });

  if (uploadResult.error) {
    return { data: null, error: uploadResult.error };
  }

  const insertResult = await supabase
    .from("files")
    .insert({
      client_id: input.clientId,
      folder_id: input.isExtraFile ? null : input.folderId || null,
      name: input.file.name,
      storage_path: path,
      file_type: input.file.type || null,
      file_size: input.file.size,
      is_extra_file: Boolean(input.isExtraFile),
    })
    .select()
    .single();

  return insertResult;
}

export async function getSignedFileUrl(storagePath: string) {
  return supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
}

export async function softDeleteFile(id: string) {
  return supabase
    .from("files")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function restoreFile(id: string) {
  return supabase
    .from("files")
    .update({
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function renameFile(id: string, name: string) {
  const { error } = await supabase
    .from("files")
    .update({
      name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return { error };
}

export async function moveFiles(
  ids: string[],
  destinationFolderId: string | null,
) {
  if (ids.length === 0) {
    return {
      data: [] as Array<Pick<FileRow, "id" | "folder_id" | "is_extra_file">>,
      error: null,
    };
  }

  const expectedExtra = destinationFolderId === null;
  const updatedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("files")
    .update({
      folder_id: destinationFolderId,
      is_extra_file: expectedExtra,
      updated_at: updatedAt,
    })
    .in("id", ids);

  if (updateError) return { data: null, error: updateError };

  const verify = async () =>
    supabase
      .from("files")
      .select("id, folder_id, is_extra_file")
      .in("id", ids)
      .is("deleted_at", null);

  let { data: verified, error: verifyError } = await verify();
  if (verifyError) return { data: null, error: verifyError };

  const isCorrect = (rows: typeof verified) => {
    if (!rows || rows.length !== ids.length) return false;
    const returnedIds = new Set(rows.map((row) => row.id));
    if (ids.some((id) => !returnedIds.has(id))) return false;
    return rows.every(
      (row) =>
        row.folder_id === destinationFolderId &&
        Boolean(row.is_extra_file) === expectedExtra,
    );
  };

  if (!isCorrect(verified)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const retry = await supabase
      .from("files")
      .update({
        folder_id: destinationFolderId,
        is_extra_file: expectedExtra,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);

    if (retry.error) return { data: null, error: retry.error };

    await new Promise((resolve) => setTimeout(resolve, 150));
    const secondVerify = await verify();
    verified = secondVerify.data;
    verifyError = secondVerify.error;
    if (verifyError) return { data: null, error: verifyError };
  }

  if (!isCorrect(verified)) {
    return {
      data: verified || [],
      error: new Error(
        "The move did not persist in the database. The file was left in place so it will not jump back after refresh.",
      ),
    };
  }

  return { data: verified || [], error: null };
}
