import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Source-level UI safety/features patch for Home.tsx.
 * This only changes the browser bundle. It does not alter Supabase storage,
 * database records, or desktop-sync behavior.
 */
function patchHomeUi(): Plugin {
  return {
    name: "patch-home-ui",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/pages/Home.tsx")) return null;

      let patched = code;

      // Preserve folders/files/notes when editing client metadata.
      const clientEditBug =
        "client.id === editingClientId ? { ...client, ...clientFromRow(data as ClientRow) } : client,";
      const clientEditFix = `client.id === editingClientId
              ? {
                  ...client,
                  ...clientFromRow(data as ClientRow),
                  folders: client.folders,
                  extraFiles: client.extraFiles,
                  notes: client.notes,
                }
              : client,`;

      if (patched.includes(clientEditBug)) {
        patched = patched.replace(clientEditBug, clientEditFix);
      }

      // Reflect file moves locally instead of reloading the entire workspace.
      const moveReloadBug = `const movedCount = selectedFileIds.length;
    setSelectedFileIds([]);
    setMoveTarget("");
    await loadWorkspace();`;

      const moveReloadFix = `const movedCount = selectedFileIds.length;
    const movedIds = new Set(selectedFileIds);
    const movedFiles = [
      ...selectedClient.extraFiles,
      ...selectedClient.folders.flatMap((folder) => folder.files),
    ].filter((file) => movedIds.has(file.id));

    setClients((current) =>
      current.map((client) => {
        if (client.id !== selectedClient.id) return client;

        const remainingExtraFiles = client.extraFiles.filter(
          (file) => !movedIds.has(file.id),
        );
        const foldersWithoutMovedFiles = client.folders.map((folder) => ({
          ...folder,
          files: folder.files.filter((file) => !movedIds.has(file.id)),
        }));

        if (!destinationFolderId) {
          return {
            ...client,
            extraFiles: [...movedFiles, ...remainingExtraFiles],
            folders: foldersWithoutMovedFiles,
          };
        }

        return {
          ...client,
          extraFiles: remainingExtraFiles,
          folders: foldersWithoutMovedFiles.map((folder) =>
            folder.id === destinationFolderId
              ? { ...folder, files: [...movedFiles, ...folder.files] }
              : folder,
          ),
        };
      }),
    );

    setSelectedFileIds([]);
    setMoveTarget("");`;

      if (patched.includes(moveReloadBug)) {
        patched = patched.replace(moveReloadBug, moveReloadFix);
      }

      // Recognize Word documents by MIME type or extension.
      const fileTypeLabelBug = `const fileTypeLabel = (file: StoredFile) => {
  if (file.type?.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) return "PDF";
  if (file.type?.startsWith("image/")) return "Image";
  if (file.type?.startsWith("text/")) return "Text";
  return file.name.split(".").pop()?.toUpperCase() || "File";
};`;
      const fileTypeLabelFix = `const fileTypeLabel = (file: StoredFile) => {
  const lowerName = file.name.toLowerCase();
  const lowerType = file.type?.toLowerCase() || "";
  if (lowerType.includes("pdf") || lowerName.endsWith(".pdf")) return "PDF";
  if (
    lowerType.includes("msword") ||
    lowerType.includes("wordprocessingml") ||
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".docx")
  ) return "Word";
  if (lowerType.startsWith("image/")) return "Image";
  if (lowerType.startsWith("text/")) return "Text";
  return file.name.split(".").pop()?.toUpperCase() || "File";
};`;

      if (patched.includes(fileTypeLabelBug)) {
        patched = patched.replace(fileTypeLabelBug, fileTypeLabelFix);
      }

      // Replace FileList with a grid/list toggle. List mode intentionally shows
      // the complete filename (wrapping as needed) instead of truncating it.
      const fileListPattern = /function FileList\([\s\S]*?\n}\n\nfunction FileThumb/;
      const fileListReplacement = `function FileTypeBadge({ file }: { file: StoredFile }) {
  const type = fileTypeLabel(file);

  if (type === "PDF") {
    return (
      <span className="inline-flex h-7 min-w-10 shrink-0 items-center justify-center rounded-lg bg-red-600 px-2 text-[10px] font-black tracking-wide text-white shadow-sm">
        PDF
      </span>
    );
  }

  if (type === "Word") {
    return (
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-sm font-black text-white shadow-sm" title="Microsoft Word document">
        W
      </span>
    );
  }

  return (
    <span className="inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-lg bg-slate-200 px-2 text-[10px] font-black text-slate-600">
      {type}
    </span>
  );
}

function FileList({
  files,
  emptyText,
  onDelete,
  onRename,
  onPreview,
  selectedFileIds,
  onToggleSelected,
}: {
  files: StoredFile[];
  emptyText: string;
  onDelete: (fileId: string) => void;
  onRename: (fileId: string, currentName: string) => void;
  onPreview: (file: StoredFile) => void;
  selectedFileIds: string[];
  onToggleSelected: (fileId: string) => void;
}) {
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try {
      return window.localStorage.getItem("tjy-file-view-mode") === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });

  const changeViewMode = (mode: "grid" | "list") => {
    setViewMode(mode);
    try {
      window.localStorage.setItem("tjy-file-view-mode", mode);
    } catch {
      // Ignore storage failures; the view still changes for this session.
    }
  };

  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-2">
        <span className="mr-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">View</span>
        <button
          type="button"
          onClick={() => changeViewMode("grid")}
          className={\`rounded-xl border px-3 py-2 text-sm font-black transition \${
            viewMode === "grid"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
          }\`}
        >
          Grid
        </button>
        <button
          type="button"
          onClick={() => changeViewMode("list")}
          className={\`rounded-xl border px-3 py-2 text-sm font-black transition \${
            viewMode === "list"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
          }\`}
        >
          List
        </button>
      </div>

      {viewMode === "list" ? (
        <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white">
          {files.map((file) => (
            <div
              key={file.id}
              role="button"
              tabIndex={0}
              onClick={() => onPreview(file)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onPreview(file);
              }}
              className={\`flex cursor-pointer items-start gap-3 border-b border-slate-300 px-4 py-3 text-left last:border-b-0 hover:bg-blue-50/60 \${
                selectedFileIds.includes(file.id) ? "bg-blue-50" : "bg-white"
              }\`}
            >
              <button
                type="button"
                title={selectedFileIds.includes(file.id) ? "Deselect file" : "Select file"}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSelected(file.id);
                }}
                className="mt-0.5 shrink-0 rounded-lg p-1 text-blue-600 hover:bg-blue-100"
              >
                {selectedFileIds.includes(file.id) ? (
                  <CheckSquare2 className="h-5 w-5" />
                ) : (
                  <Square className="h-5 w-5 text-slate-400" />
                )}
              </button>

              <FileTypeBadge file={file} />

              <div className="min-w-0 flex-1">
                <p className="whitespace-normal break-words text-sm font-black leading-5 text-slate-950">
                  {file.name}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  title="Rename file"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRename(file.id, file.name);
                  }}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-100 hover:text-blue-600"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Delete file"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(file.id);
                  }}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((file) => (
            <article
              key={file.id}
              role="button"
              tabIndex={0}
              onClick={() => onPreview(file)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onPreview(file);
              }}
              className={\`group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-200 \${
                selectedFileIds.includes(file.id)
                  ? "border-blue-500 ring-2 ring-blue-100"
                  : "border-slate-200 hover:border-blue-200"
              }\`}
            >
              <button
                type="button"
                title={selectedFileIds.includes(file.id) ? "Deselect file" : "Select file"}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSelected(file.id);
                }}
                className="absolute left-3 top-3 z-10 rounded-lg bg-white/95 p-1.5 text-blue-600 shadow-md backdrop-blur"
              >
                {selectedFileIds.includes(file.id) ? (
                  <CheckSquare2 className="h-5 w-5" />
                ) : (
                  <Square className="h-5 w-5 text-slate-400" />
                )}
              </button>
              <FileThumb file={file} />

              <div className="p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950 group-hover:text-blue-700" title={file.name}>
                      {file.name}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      {fileTypeLabel(file)} • {fileSizeLabel(file.size)}
                    </p>
                  </div>
                  <FileTypeBadge file={file} />
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                  <p className="text-xs font-bold text-slate-400">{formatDate(file.uploadedAt)}</p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Rename file"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRename(file.id, file.name);
                      }}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Delete file"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(file.id);
                      }}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function FileThumb`;

      if (fileListPattern.test(patched)) {
        patched = patched.replace(fileListPattern, fileListReplacement);
      }

      return patched === code ? null : { code: patched, map: null };
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [patchHomeUi(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
