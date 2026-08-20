import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

// Remove any generated folder-search component from prior builds/patches.
source = source.replace(/\nfunction FolderSearchableFileList\(\{[\s\S]*?\n\}\n\n(?=function FileList\()/g, "\n");

// Restore the plain selected-folder FileList if an older build wrapped it.
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

// Remove any standalone folder-search UI using the known placeholder.
source = source.replace(/\n\s*<div className="[^"]*">[\s\S]*?<input[\s\S]*?placeholder="Search files in this folder\.\.\."[\s\S]*?<\/div>/g, "");

// Remove old folder-search state/derived values.
source = source.replace(/\n\s*const \[folderFileSearch, setFolderFileSearch\] = useState\(""\);/g, "");
source = source.replace(/\n\s*const filteredSelectedFolderFiles = useMemo\(\(\) => \{[\s\S]*?\}, \[folderFileSearch, selectedFolder\]\);/g, "");
source = source.replace(/\n\s*setFolderFileSearch\(""\);/g, "");
source = source.replace(/files=\{filteredSelectedFolderFiles\}/g, "files={selectedFolder.files}");
source = source.replace(/\n\s*\{folderFileSearch\.trim\(\) && \([\s\S]*?\)\}/g, "");

const forbidden = [
  'placeholder="Search files in this folder..."',
  'aria-label="Search files in this folder"',
  'function FolderSearchableFileList({',
  '<FolderSearchableFileList',
  'folderFileSearch',
];
for (const token of forbidden) {
  if (source.includes(token)) throw new Error(`Folder search still present: ${token}`);
}

fs.writeFileSync(filePath, source);
console.log("Individual folder view verified with zero search bars.");
