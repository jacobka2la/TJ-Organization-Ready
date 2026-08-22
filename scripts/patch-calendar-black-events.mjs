import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

const start = source.indexOf("const eventTypeClasses: Record<string, string> = {");
if (start === -1) throw new Error("Could not find eventTypeClasses");
const end = source.indexOf("};", start);
if (end === -1) throw new Error("Could not find end of eventTypeClasses");

const replacement = `const eventTypeClasses: Record<string, string> = {\n  Court: "border-slate-900 bg-slate-950 text-white",\n  Deposition: "border-slate-900 bg-slate-950 text-white",\n  "Phone Call": "border-slate-900 bg-slate-950 text-white",\n  "Client Meeting": "border-slate-900 bg-slate-950 text-white",\n  Mediation: "border-slate-900 bg-slate-950 text-white",\n  Deadline: "border-slate-900 bg-slate-950 text-white",\n  Other: "border-slate-900 bg-slate-950 text-white",\n};`;

source = source.slice(0, start) + replacement + source.slice(end + 2);
fs.writeFileSync(filePath, source);
console.log("Calendar event color coding disabled; all event types use black styling.");
