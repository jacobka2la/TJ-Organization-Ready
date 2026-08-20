import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

const oldMoveStart = source.indexOf("  const moveSelectedFiles = async () => {");
const oldMoveEnd = source.indexOf("\n\n  if (!isLoggedIn)", oldMoveStart);

if (oldMoveStart === -1 || oldMoveEnd === -1) {
  throw new Error("Could not locate moveSelectedFiles in Home.tsx");
}

const replacement = `  const moveSelectedFiles = async () => {
    if (!selectedClient || selectedFileIds.length === 0 || !moveTarget) return;

    const clientId = selectedClient.id;
    const idsToMove = [...selectedFileIds];
    const destinationFolderId = moveTarget === "extra" ? null : moveTarget;
    const destinationFolder = destinationFolderId
      ? selectedClient.folders.find((folder) => folder.id === destinationFolderId)
      : null;

    if (destinationFolderId && !destinationFolder) {
      setAppError("That destination folder is no longer available. Please choose it again.");
      return;
    }

    const destinationName = destinationFolder?.name || "Extra Files";

    const fileSnapshots = idsToMove
      .map((fileId) => {
        const extra = selectedClient.extraFiles.find((file) => file.id === fileId);
        if (extra) return { file: extra, folderId: null as string | null };
        for (const folder of selectedClient.folders) {
          const file = folder.files.find((item) => item.id === fileId);
          if (file) return { file, folderId: folder.id as string | null };
        }
        return null;
      })
      .filter((item): item is { file: StoredFile; folderId: string | null } => Boolean(item));

    if (fileSnapshots.length !== idsToMove.length) {
      setAppError("One or more selected files could not be found. Clear the selection and try again.");
      return;
    }

    setAppError("");
    const { error } = await moveFilesInDb(idsToMove, destinationFolderId);
    if (error) {
      setAppError(error.message || "Could not move selected files.");
      return;
    }

    const idSet = new Set(idsToMove);
    const movedFiles = fileSnapshots.map((snapshot) => snapshot.file);

    // Update only the affected client locally. Do not immediately reload the
    // whole workspace after a move; that was allowing an older fetch response
    // to overwrite brand-new folders and make successful moves appear to undo.
    setClients((current) =>
      current.map((client) => {
        if (client.id !== clientId) return client;

        const cleanedFolders = client.folders.map((folder) => ({
          ...folder,
          files: folder.files.filter((file) => !idSet.has(file.id)),
        }));
        const cleanedExtra = client.extraFiles.filter((file) => !idSet.has(file.id));

        if (destinationFolderId === null) {
          return { ...client, folders: cleanedFolders, extraFiles: [...movedFiles, ...cleanedExtra] };
        }

        return {
          ...client,
          extraFiles: cleanedExtra,
          folders: cleanedFolders.map((folder) =>
            folder.id === destinationFolderId
              ? { ...folder, files: [...movedFiles, ...folder.files] }
              : folder,
          ),
        };
      }),
    );

    const movedCount = idsToMove.length;
    setSelectedFileIds([]);
    setMoveTarget("");

    offerUndo(
      \`Moved \${movedCount} \${movedCount === 1 ? "file" : "files"} to \${destinationName}.\`,
      async () => {
        const groups = new Map<string, string[]>();
        fileSnapshots.forEach(({ file, folderId }) => {
          const key = folderId || "extra";
          groups.set(key, [...(groups.get(key) || []), file.id]);
        });

        for (const [key, ids] of groups) {
          const { error: undoError } = await moveFilesInDb(ids, key === "extra" ? null : key);
          if (undoError) throw undoError;
        }

        const originById = new Map(fileSnapshots.map(({ file, folderId }) => [file.id, folderId]));
        setClients((current) =>
          current.map((client) => {
            if (client.id !== clientId) return client;

            const allMovedIds = new Set(fileSnapshots.map(({ file }) => file.id));
            let folders = client.folders.map((folder) => ({
              ...folder,
              files: folder.files.filter((file) => !allMovedIds.has(file.id)),
            }));
            let extraFiles = client.extraFiles.filter((file) => !allMovedIds.has(file.id));

            for (const snapshot of fileSnapshots) {
              const origin = originById.get(snapshot.file.id) ?? null;
              if (origin === null) {
                extraFiles = [snapshot.file, ...extraFiles];
              } else {
                folders = folders.map((folder) =>
                  folder.id === origin
                    ? { ...folder, files: [snapshot.file, ...folder.files] }
                    : folder,
                );
              }
            }

            return { ...client, folders, extraFiles };
          }),
        );
      },
    );
  };`;

source = source.slice(0, oldMoveStart) + replacement + source.slice(oldMoveEnd);

// Make folder delete controls dark enough to remain visible on the gray theme.
source = source.replace(
  'className="rounded-xl p-2 text-slate-300 hover:bg-red-50 hover:text-red-600"',
  'className="rounded-xl p-2 text-slate-950 hover:bg-red-50 hover:text-red-600"',
);

fs.writeFileSync(filePath, source);
console.log("Patched stable file moves and visible folder trash buttons.");
