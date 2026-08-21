import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

const oldReturn = `  return sortClients(Array.from(clientsById.values()));`;
const newReturn = `  const sorted = Array.from(clientsById.values()).map((client) => ({
    ...client,
    folders: client.folders
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))
      .map((folder) => ({
        ...folder,
        files: folder.files
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })),
      })),
    extraFiles: client.extraFiles
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })),
  }));

  return sortClients(sorted);`;

if (source.includes(oldReturn)) {
  source = source.replace(oldReturn, newReturn);
} else if (!source.includes("const sorted = Array.from(clientsById.values()).map")) {
  throw new Error("Could not locate buildClientsFromRows return in Home.tsx");
}

fs.writeFileSync(filePath, source);
console.log("Client folders and files sorted alphabetically at data load.");
