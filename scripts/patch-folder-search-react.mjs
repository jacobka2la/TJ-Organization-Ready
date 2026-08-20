import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

// Add one folder-specific search state to the React page.
if (!source.includes('const [folderFileSearch, setFolderFileSearch] = useState("");')) {
  source = source.replace(
    '  const [clientFileSearch, setClientFileSearch] = useState("");',
    '  const [clientFileSearch, setClientFileSearch] = useState("");\n  const [folderFileSearch, setFolderFileSearch] = useState("");',
  );
}

// Reset the folder query whenever the user changes client/folder/view.
const resetBlock = `  useEffect(() => {
    setSelectedFileIds([]);
    setMoveTarget("");
  }, [selectedClientId, selectedFolderId, view]);`;
if (source.includes(resetBlock) && !source.includes('setFolderFileSearch("");\n    setSelectedFileIds([]);')) {
  source = source.replace(
    resetBlock,
    `  useEffect(() => {
    setFolderFileSearch("");
    setSelectedFileIds([]);
    setMoveTarget("");
  }, [selectedClientId, selectedFolderId, view]);`,
  );
}

// Compute matching files only from the currently-open folder.
if (!source.includes("const filteredSelectedFolderFiles = useMemo")) {
  const marker = `  useEffect(() => {
    if (!isLoggedIn || clients.length === 0) return;`;
  const derived = `  const filteredSelectedFolderFiles = useMemo(() => {
    if (!selectedFolder) return [];
    const query = folderFileSearch.trim().toLowerCase();
    if (!query) return selectedFolder.files;
    return selectedFolder.files.filter((file) => file.name.toLowerCase().includes(query));
  }, [folderFileSearch, selectedFolder]);

`;
  if (!source.includes(marker)) throw new Error("Could not locate selected-folder derived state insertion point");
  source = source.replace(marker, derived + marker);
}

const folderViewStart = source.indexOf('{view === "folder-file" && selectedClient && selectedFolder && (');
if (folderViewStart === -1) throw new Error("Could not locate folder-file view");
const folderViewEnd = source.indexOf('\n        )}', folderViewStart);
if (folderViewEnd === -1) throw new Error("Could not locate end of folder-file view");

let folderView = source.slice(folderViewStart, folderViewEnd);

// Remove any accidental prior React folder-search UI before adding the canonical one.
folderView = folderView.replace(/\n\s*<div className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">[\s\S]*?placeholder="Search files in this folder\.\.\."[\s\S]*?<\/div>/g, "");
folderView = folderView.replace(/\n\s*\{folderFileSearch\.trim\(\) && \([\s\S]*?\)\}/g, "");

const moveToolbarMarker = '                <FileMoveToolbar\n                  selectedCount={selectedFileIds.length}';
if (!folderView.includes(moveToolbarMarker)) throw new Error("Could not locate folder move toolbar");

const searchUi = `                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <Search className="h-5 w-5 shrink-0 text-slate-400" />
                  <input
                    value={folderFileSearch}
                    onChange={(event) => setFolderFileSearch(event.target.value)}
                    placeholder="Search files in this folder..."
                    aria-label="Search files in this folder"
                    className="w-full bg-transparent outline-none"
                  />
                  {folderFileSearch && (
                    <button
                      type="button"
                      onClick={() => setFolderFileSearch("")}
                      className="rounded-lg p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-950"
                      aria-label="Clear folder search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {folderFileSearch.trim() && (
                  <p className="mb-3 text-xs font-bold text-slate-500">
                    {filteredSelectedFolderFiles.length} of {selectedFolder.files.length} files match “{folderFileSearch}”
                  </p>
                )}
`;
folderView = folderView.replace(moveToolbarMarker, searchUi + moveToolbarMarker);
folderView = folderView.replace('files={selectedFolder.files}', 'files={filteredSelectedFolderFiles}');
folderView = folderView.replace('emptyText="No files uploaded in this folder yet."', 'emptyText={folderFileSearch.trim() ? "No matching files found in this folder." : "No files uploaded in this folder yet."}');

// Safety: exactly one folder-search input must exist inside the folder view.
const folderSearchCount = (folderView.match(/placeholder="Search files in this folder\.\.\."/g) || []).length;
if (folderSearchCount !== 1) throw new Error(`Expected exactly one React folder search, found ${folderSearchCount}`);

source = source.slice(0, folderViewStart) + folderView + source.slice(folderViewEnd);

fs.writeFileSync(filePath, source);
console.log("Added exactly one working React folder search.");
