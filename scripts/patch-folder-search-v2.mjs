import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

const marker = "function FileList({";
if (!source.includes(marker)) {
  throw new Error("Could not locate FileList in Home.tsx");
}

if (!source.includes("function FolderSearchableFileList({")) {
  const component = `function FolderSearchableFileList({
  files,
  onDelete,
  onRename,
  onPreview,
  selectedFileIds,
  onToggleSelected,
}: {
  files: StoredFile[];
  onDelete: (fileId: string) => void;
  onRename: (fileId: string, currentName: string) => void;
  onPreview: (file: StoredFile) => void;
  selectedFileIds: string[];
  onToggleSelected: (fileId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const filteredFiles = normalized
    ? files.filter((file) => file.name.toLowerCase().includes(normalized))
    : files;

  return (
    <>
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <Search className="h-5 w-5 shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search files in this folder..."
          className="w-full bg-transparent outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-950"
            aria-label="Clear folder search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {normalized && (
        <p className="mb-3 text-xs font-bold text-slate-500">
          {filteredFiles.length} of {files.length} files match “{query}”
        </p>
      )}
      <FileList
        files={filteredFiles}
        emptyText={normalized ? "No matching files found in this folder." : "No files uploaded in this folder yet."}
        onDelete={onDelete}
        onRename={onRename}
        onPreview={onPreview}
        selectedFileIds={selectedFileIds}
        onToggleSelected={onToggleSelected}
      />
    </>
  );
}

`;
  source = source.replace(marker, component + marker);
}

const oldBlock = `                <FileList
                  files={selectedFolder.files}
                  emptyText="No files uploaded in this folder yet."
                  onDelete={deleteFolderFile}
                  onRename={renameFile}
                  onPreview={handlePreviewFile}
                  selectedFileIds={selectedFileIds}
                  onToggleSelected={(fileId) =>
                    setSelectedFileIds((current) =>
                      current.includes(fileId)
                        ? current.filter((id) => id !== fileId)
                        : [...current, fileId],
                    )
                  }
                />`;

const newBlock = `                <FolderSearchableFileList
                  key={selectedFolder.id}
                  files={selectedFolder.files}
                  onDelete={deleteFolderFile}
                  onRename={renameFile}
                  onPreview={handlePreviewFile}
                  selectedFileIds={selectedFileIds}
                  onToggleSelected={(fileId) =>
                    setSelectedFileIds((current) =>
                      current.includes(fileId)
                        ? current.filter((id) => id !== fileId)
                        : [...current, fileId],
                    )
                  }
                />`;

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
} else if (!source.includes("<FolderSearchableFileList")) {
  throw new Error("Could not locate folder FileList block in Home.tsx");
}

fs.writeFileSync(filePath, source);
console.log("Stable folder search patch applied.");
