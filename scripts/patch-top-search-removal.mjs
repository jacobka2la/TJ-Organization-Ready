import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

// Remove ONLY the old client-wide search UI card (the top search bar).
// Leave clientFileSearch state/results in place so this patch cannot break
// TypeScript or other logic that may still reference those values.
const placeholder = 'placeholder="Search every file in this client..."';
const placeholderIndex = source.indexOf(placeholder);

if (placeholderIndex !== -1) {
  // This search lives inside its own rounded white card. Walk backward to that
  // card's opening div and forward through the matching search-results block.
  const cardStartMarker = '<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">';
  const cardStart = source.lastIndexOf(cardStartMarker, placeholderIndex);

  if (cardStart === -1) {
    throw new Error("Found top client search input but could not locate its card wrapper");
  }

  // The next sibling card is the Folders card; remove everything before it.
  const nextCard = source.indexOf(cardStartMarker, placeholderIndex + placeholder.length);
  if (nextCard === -1) {
    throw new Error("Could not locate Folders card after top client search");
  }

  source = source.slice(0, cardStart) + source.slice(nextCard);
}

// Safety: this exact unwanted top search must not survive the patch.
if (source.includes(placeholder)) {
  throw new Error("Top client-wide search still exists after removal patch");
}

fs.writeFileSync(filePath, source);
console.log("Removed top client-wide search UI; folder search left untouched.");
