import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

const oldBlock = `{folders
            .filter((folder) => folder.id !== currentFolderId)
            .map((folder) => (`;

const newBlock = `{folders
            .filter((folder) => folder.id !== currentFolderId)
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))
            .map((folder) => (`;

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
} else if (!source.includes('.sort((a, b) => a.name.localeCompare(b.name')) {
  throw new Error("Could not locate Move to folder options in Home.tsx");
}

fs.writeFileSync(filePath, source);
console.log("Move to folder dropdown sorted A-Z.");
