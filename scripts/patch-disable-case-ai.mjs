import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

// Disable Case AI UI without deleting its component/service files, so it can
// be restored later as a future upgrade.
source = source.replace(/\nimport CaseAI from "@\/components\/CaseAI";/g, "");

// Remove any rendered CaseAI block, including build-generated variants.
source = source.replace(/\n\s*<CaseAI\b[\s\S]*?\/>/g, "");

// Remove helper callbacks that exist only for opening Case AI sources.
source = source.replace(/\n\s*const openCaseAISource = async \([\s\S]*?\n\s*\};/g, "");

if (source.includes('<CaseAI') || source.includes('import CaseAI')) {
  throw new Error("Case AI UI still exists after disable patch");
}

fs.writeFileSync(filePath, source);
console.log("Case AI disabled; AI Client Import remains enabled.");
