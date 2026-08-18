import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Temporary source-level safety patch for Home.tsx.
 *
 * Client metadata updates rebuild a Client from a database row. That row only
 * contains client fields, while clientFromRow initializes folders/files/notes
 * as empty arrays. Spreading that result over the current client therefore
 * makes the UI appear to lose all of its folders until the next full refresh.
 *
 * File moves also did a full workspace reload immediately after the database
 * update. Keeping that change local avoids a brief incomplete reload from
 * blanking the visible folder tree.
 *
 * This plugin only changes the browser bundle. It does not delete, move, or
 * otherwise mutate Supabase records or storage beyond the actions the app was
 * already performing.
 */
function preserveClientCollections(): Plugin {
  return {
    name: "preserve-client-collections",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/pages/Home.tsx")) return null;

      let patched = code;

      const clientEditBug =
        "client.id === editingClientId ? { ...client, ...clientFromRow(data as ClientRow) } : client,";
      const clientEditFix = `client.id === editingClientId
              ? {
                  ...client,
                  ...clientFromRow(data as ClientRow),
                  // Keep loaded client collections when only metadata changes.
                  folders: client.folders,
                  extraFiles: client.extraFiles,
                  notes: client.notes,
                }
              : client,`;

      if (patched.includes(clientEditBug)) {
        patched = patched.replace(clientEditBug, clientEditFix);
      }

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

    // The database move already succeeded. Reflect it locally instead of
    // rebuilding the entire workspace and briefly blanking the folder tree.
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
  plugins: [preserveClientCollections(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
