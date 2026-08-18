import fs from "node:fs";

const filePath = "src/components/AIClientImport.tsx";
let source = fs.readFileSync(filePath, "utf8");

// Always upload the original filename. AI may classify the document and choose
// a folder, but it must never rename a file the user already named.
source = source.replace(
  'ensureOriginalExtension(document.suggestedFilename, selected.originalFilename)',
  'selected.originalFilename',
);

// Hide/remove the editable AI filename field from the review plan and show the
// existing filename as read-only text instead.
source = source.replace(
  /<input\n\s+value=\{document\.suggestedFilename\}\n\s+onChange=\{\(event\) =>\n\s+updateDocument\(index, \{\n\s+suggestedFilename:\n\s+event\.target\.value,\n\s+\}\)\n\s+\}\n\s+className="rounded-xl border border-slate-200 bg-white px-3 py-2\.5 text-sm font-bold outline-none focus:border-violet-500"\n\s+\/>/g,
  `<div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 break-words">
                          {document.originalFilename}
                        </div>`,
);

// Make the review copy explicit so nobody expects AI renaming.
source = source.replace(
  "Change any folder or filename before\n                    importing.",
  "Change the destination folder if needed. Original filenames are preserved.",
);

source = source.replace(
  "create the folders, rename the documents, and\n                organize everything.",
  "create the folders and organize the documents without changing their names.",
);

source = source.replace(
  "uploaded under its approved name.",
  "uploaded with its original filename.",
);

fs.writeFileSync(filePath, source);
console.log("AI Client Import patched to preserve original filenames.");
