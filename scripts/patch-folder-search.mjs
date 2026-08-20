import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

// Folder search is generated at build time. Start clean every build so old
// generated implementations can never stack into duplicate search bars.
source = source.replace(/\nfunction FolderSearchableFileList\(\{[\s\S]*?\n\}\n\n(?=function FileList\()/g, "\n");

// Remove any old Home-level folder-search state/derived values.
source = source.replace(/\n\s*const \[folderFileSearch, setFolderFileSearch\] = useState\(""\);/g, "");
source = source.replace(/\n\s*const filteredSelectedFolderFiles = useMemo\(\(\) => \{[\s\S]*?\}, \[folderFileSearch, selectedFolder\]\);/g, "");
source = source.replace(/\n\s*setFolderFileSearch\(""\);/g, "");
source = source.replace(/files=\{filteredSelectedFolderFiles\}/g, "files={selectedFolder.files}");
source = source.replace(/\n\s*\{folderFileSearch\.trim\(\) && \([\s\S]*?\)\}/g, "");

// Remove every standalone folder-search block that may have been baked in by
// an older deployment/patch. We only target the exact folder-search placeholder.
source = source.replace(/\n\s*<div className="[^"]*">[\s\S]*?<input[\s\S]*?placeholder="Search files in this folder\.\.\."[\s\S]*?<\/div>/g, "");

// If a previous build replaced the selected-folder FileList with our wrapper,
// put it back to the plain canonical FileList before rebuilding the wrapper.
source = source.replace(
  /<FolderSearchableFileList\s+key=\{selectedFolder\.id\}[\s\S]*?\/>/g,
  `<FileList
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
                />`,
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

if (!source.includes(oldBlock)) throw new Error("Could not locate selected-folder file list");
source = source.replace(oldBlock, newBlock);

// Hard build guard. If anything ever creates a second folder search again,
// deployment fails instead of shipping a broken/duplicate UI.
const placeholders = source.match(/placeholder="Search files in this folder\.\.\."/g) || [];
const components = source.match(/function FolderSearchableFileList\(\{/g) || [];
const usages = source.match(/<FolderSearchableFileList/g) || [];
if (placeholders.length !== 1 || components.length !== 1 || usages.length !== 1) {
  throw new Error(`Folder search invariant failed: placeholders=${placeholders.length}, components=${components.length}, usages=${usages.length}`);
}

fs.writeFileSync(filePath, source);
console.log("Exactly one working folder search bar generated.");
