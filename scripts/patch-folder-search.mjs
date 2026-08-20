import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes('const [folderFileSearch, setFolderFileSearch] = useState("");')) {
  source = source.replace(
    '  const [clientFileSearch, setClientFileSearch] = useState("");',
    '  const [clientFileSearch, setClientFileSearch] = useState("");\n  const [folderFileSearch, setFolderFileSearch] = useState("");',
  );
}

if (!source.includes('const filteredSelectedFolderFiles = useMemo')) {
  source = source.replace(
    '  const clientFileSearchResults = useMemo(() => {',
    `  const filteredSelectedFolderFiles = useMemo(() => {\n    if (!selectedFolder) return [];\n    const query = folderFileSearch.trim().toLowerCase();\n    if (!query) return selectedFolder.files;\n    return selectedFolder.files.filter((file) =>\n      file.name.toLowerCase().includes(query),\n    );\n  }, [folderFileSearch, selectedFolder]);\n\n  const clientFileSearchResults = useMemo(() => {`,
  );
}

source = source.replace(
  '  useEffect(() => {\n    setSelectedFileIds([]);\n    setMoveTarget("");\n  }, [selectedClientId, selectedFolderId, view]);',
  '  useEffect(() => {\n    setSelectedFileIds([]);\n    setMoveTarget("");\n    setFolderFileSearch("");\n  }, [selectedClientId, selectedFolderId, view]);',
);

if (!source.includes('placeholder="Search files in this folder..."')) {
  source = source.replace(
    '                <FileMoveToolbar\n                  selectedCount={selectedFileIds.length}',
    `                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">\n                  <Search className="h-5 w-5 shrink-0 text-slate-400" />\n                  <input\n                    value={folderFileSearch}\n                    onChange={(event) => setFolderFileSearch(event.target.value)}\n                    placeholder="Search files in this folder..."\n                    className="w-full bg-transparent outline-none"\n                  />\n                  {folderFileSearch && (\n                    <button\n                      type="button"\n                      onClick={() => setFolderFileSearch("")}\n                      className="rounded-lg p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-950"\n                      aria-label="Clear folder search"\n                    >\n                      <X className="h-4 w-4" />\n                    </button>\n                  )}\n                </div>\n                <FileMoveToolbar\n                  selectedCount={selectedFileIds.length}`,
  );
}

source = source.replace(
  '                  files={selectedFolder.files}\n                  emptyText="No files uploaded in this folder yet."',
  '                  files={filteredSelectedFolderFiles}\n                  emptyText={folderFileSearch.trim() ? "No matching files found in this folder." : "No files uploaded in this folder yet."}',
);

fs.writeFileSync(filePath, source);
console.log("Folder file search patched.");
