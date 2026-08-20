import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

// Kill every older/broken folder-search implementation first. The working
// search below is the only one allowed to survive the build.
source = source.replace(/\n\s*const \[folderFileSearch, setFolderFileSearch\] = useState\(""\);/g, "");
source = source.replace(/\n\s*const filteredSelectedFolderFiles = useMemo\(\(\) => \{[\s\S]*?\}, \[folderFileSearch, selectedFolder\]\);/g, "");
source = source.replace(/\n\s*setFolderFileSearch\(""\);/g, "");
source = source.replace(/files=\{filteredSelectedFolderFiles\}/g, "files={selectedFolder.files}");
source = source.replace(/emptyText=\{folderFileSearch\.trim\(\)[\s\S]*?\}/g, 'emptyText="No files uploaded in this folder yet."');

// Remove legacy search UI blocks by their unique input/state signatures.
source = source.replace(/\n\s*<div className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">[\s\S]*?value=\{folderFileSearch\}[\s\S]*?placeholder="Search files in this folder\.\.\."[\s\S]*?<\/div>/g, "");
source = source.replace(/\n\s*<div className="[^\"]*">[\s\S]*?value=\{folderFileSearch\}[\s\S]*?<\/div>/g, "");
source = source.replace(/\n\s*\{folderFileSearch\.trim\(\) && \([\s\S]*?\)\}/g, "");

// If an older self-contained component was baked into the source, remove it too
// and rebuild it from one canonical implementation below.
source = source.replace(/\nfunction FolderSearchableFileList\(\{[\s\S]*?\n\}\n\n(?=function FileList\()/g, "\n");
source = source.replace(/<FolderSearchableFileList[\s\S]*?\/>/g, (match) =>
  match.includes("files={selectedFolder.files}") ? `__FOLDER_SEARCH_SLOT__` : match,
);

const marker = "function FileList({";
if (!source.includes(marker)) throw new Error("Could not locate FileList in Home.tsx");

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
  const normalizedQuery = query.trim().toLowerCase();
  const filteredFiles = normalizedQuery
    ? files.filter((file) => file.name.toLowerCase().includes(normalizedQuery))
    : files;

  return (
    <>
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <Search className="h-5 w-5 shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full bg-transparent outline-none"
          placeholder="Search files in this folder..."
          aria-label="Search files in this folder"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="rounded-lg p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-950" aria-label="Clear folder search">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {normalizedQuery && (
        <p className="mb-3 text-xs font-bold text-slate-500">
          {filteredFiles.length} of {files.length} files match “{query}”
        </p>
      )}
      <FileList
        files={filteredFiles}
        emptyText={normalizedQuery ? "No matching files found in this folder." : "No files uploaded in this folder yet."}
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

const newBlock = `<FolderSearchableFileList
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

if (source.includes("__FOLDER_SEARCH_SLOT__")) {
  source = source.replace("__FOLDER_SEARCH_SLOT__", newBlock);
} else {
  const oldBlock = `<FileList
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
  if (source.includes(oldBlock)) source = source.replace(oldBlock, newBlock);
}

// Safety check: exactly one folder-search input should exist after patching.
const count = (source.match(/placeholder="Search files in this folder\.\.\."/g) || []).length;
if (count !== 1) throw new Error(`Expected exactly one folder search bar, found ${count}`);

fs.writeFileSync(filePath, source);
console.log("Legacy folder search removed; exactly one working folder search remains.");
