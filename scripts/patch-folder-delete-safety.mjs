import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

// 1) Permanent safety net: orphaned files must never disappear from the UI.
const oldAttach = `    const folder = client.folders.find((item) => item.id === row.folder_id);\n    if (folder) folder.files.push(file);`;
const newAttach = `    const folder = client.folders.find((item) => item.id === row.folder_id);\n    if (folder) {\n      folder.files.push(file);\n    } else {\n      // Never silently hide a file whose folder is missing or deleted.\n      client.extraFiles.push(file);\n    }`;

if (source.includes(oldAttach)) {
  source = source.replace(oldAttach, newAttach);
} else if (!source.includes("Never silently hide a file whose folder is missing or deleted.")) {
  throw new Error("Could not locate buildClientsFromRows file attachment logic");
}

// 2) Folder deletion must first move every file to Extra Files.
const oldDelete = `    const confirmed = window.confirm(\n      \`Delete "\${folder.name}"?\\n\\nThe folder and its file list will be removed.\`,\n    );\n    if (!confirmed) return;\n\n    const { error } = await softDeleteFolder(folderId);\n    if (error) {\n      setAppError(error.message || "Could not delete folder.");\n      return;\n    }\n\n    setClients((current) =>\n      current.map((client) =>\n        client.id === selectedClient.id\n          ? {\n              ...client,\n              folders: client.folders.filter((item) => item.id !== folderId),\n            }\n          : client,\n      ),\n    );\n\n    offerUndo(\`Deleted folder “\${folder.name}.”\`, async () => {\n      const { error: restoreError } = await restoreFolder(folderId);\n      if (restoreError) throw restoreError;\n      await loadWorkspace();\n    });`;

const newDelete = `    const confirmed = window.confirm(\n      \`Delete "\${folder.name}"?\\n\\nIts files will be moved to Extra Files.\`,\n    );\n    if (!confirmed) return;\n\n    const fileIds = folder.files.map((file) => file.id);\n\n    // Move files first. If that fails, do NOT delete the folder.\n    if (fileIds.length > 0) {\n      const { error: moveError } = await moveFilesInDb(fileIds, null);\n      if (moveError) {\n        setAppError(moveError.message || "Could not move folder files to Extra Files.");\n        return;\n      }\n    }\n\n    const { error } = await softDeleteFolder(folderId);\n    if (error) {\n      // Folder deletion failed after the move, so restore the original placement.\n      if (fileIds.length > 0) await moveFilesInDb(fileIds, folderId);\n      setAppError(error.message || "Could not delete folder.");\n      return;\n    }\n\n    setClients((current) =>\n      current.map((client) =>\n        client.id === selectedClient.id\n          ? {\n              ...client,\n              folders: client.folders.filter((item) => item.id !== folderId),\n              extraFiles: [...folder.files, ...client.extraFiles],\n            }\n          : client,\n      ),\n    );\n\n    offerUndo(\`Deleted folder “\${folder.name}.” Files moved to Extra Files.\`, async () => {\n      const { error: restoreError } = await restoreFolder(folderId);\n      if (restoreError) throw restoreError;\n      if (fileIds.length > 0) {\n        const { error: moveBackError } = await moveFilesInDb(fileIds, folderId);\n        if (moveBackError) throw moveBackError;\n      }\n      await loadWorkspace();\n    });`;

if (source.includes(oldDelete)) {
  source = source.replace(oldDelete, newDelete);
} else if (!source.includes("Its files will be moved to Extra Files.")) {
  throw new Error("Could not locate deleteFolder logic");
}

fs.writeFileSync(filePath, source);
console.log("Folder delete safety applied: files move to Extra Files and orphaned files remain visible.");
