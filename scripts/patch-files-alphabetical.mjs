import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

// Sort the files passed to FileList at render time without mutating React/Supabase state.
// This makes folder contents, Extra Files, and search result FileLists consistently A-Z.
const oldMap = "{files.map((file) => (";
const newMap = `{files
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))
        .map((file) => (`;

if (source.includes(oldMap)) {
  source = source.replace(oldMap, newMap);
} else if (!source.includes('.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))')) {
  throw new Error("Could not locate FileList file mapping in Home.tsx");
}

fs.writeFileSync(filePath, source);
console.log("Files rendered alphabetically A-Z.");
