import fs from "node:fs";

const filePath = "src/services/document-index.ts";
let source = fs.readFileSync(filePath, "utf8");

// Remove the automatic OCR cap so every scanned PDF page gets attempted.
source = source.replace(
  /\/\/ Automatic Case AI preparation must never spend minutes OCRing one scan-heavy PDF\.\n\/\/ We still index selectable text from every page, while OCR is limited to a few pages\.\nconst MAX_OCR_PAGES_PER_FILE = 3;\n/,
  "",
);

// Replace the full capped OCR condition instead of removing individual lines,
// which could leave a dangling && and break the TypeScript build.
source = source.replace(
  /text\.length < MIN_SELECTABLE_TEXT_LENGTH &&\n\s*!ocrUnavailable &&\n\s*ocrPages < MAX_OCR_PAGES_PER_FILE/g,
  "text.length < MIN_SELECTABLE_TEXT_LENGTH",
);

// Do not permanently disable OCR after one worker-start failure.
source = source.replace(/\n\s*let ocrUnavailable = false;/g, "");
source = source.replace(/\n\s*if \(!worker\) ocrUnavailable = true;/g, "");

// If OCR times out or a worker wedges, kill it so the next page gets a fresh attempt.
source = source.replace(
  /console\.warn\(`OCR skipped for \$\{file\.name\}, page \$\{pageNumber\}:`, ocrError\);\n\s*}/g,
  `console.warn(\`OCR failed for \${file.name}, page \${pageNumber}; continuing to the next page:\`, ocrError);\n          if (worker) {\n            try { await worker.terminate(); } catch (terminateError) {\n              console.warn("Could not terminate the OCR worker:", terminateError);\n            }\n            worker = null;\n          }\n        }`,
);

fs.writeFileSync(filePath, source);
console.log("Case AI indexing patched to OCR every PDF page and recover from stuck OCR workers.");
