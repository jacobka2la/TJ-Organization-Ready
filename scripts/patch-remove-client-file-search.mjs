import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

// Remove the old client-wide search UI. The user wants the folder-level
// searchable file list only; this is the unwanted TOP bar seen in the UI.
const start = source.indexOf('              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">\n                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">\n                  <Search className="h-5 w-5 text-slate-400" />\n                  <input\n                    value={clientFileSearch}');

if (start !== -1) {
  const nextFoldersCard = source.indexOf('              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">\n                <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">', start);
  if (nextFoldersCard === -1) throw new Error("Found old client search but could not find following folders card");
  source = source.slice(0, start) + source.slice(nextFoldersCard);
}

// Remove its state and memoized results so it cannot leak into another view.
source = source.replace(/\n\s*const \[clientFileSearch, setClientFileSearch\] = useState\(""\);/g, "");
source = source.replace(/\n\s*const clientFileSearchResults = useMemo\(\(\) => \{[\s\S]*?\n\s*\}, \[clientFileSearch, selectedClient\]\);/g, "");
source = source.replace(/\n\s*setClientFileSearch\(""\);/g, "");

if (source.includes('value={clientFileSearch}') || source.includes('placeholder="Search every file in this client..."')) {
  throw new Error("Unwanted top client-file search still exists after cleanup");
}

fs.writeFileSync(filePath, source);
console.log("Removed unwanted top/client-wide file search bar.");
