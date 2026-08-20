import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

// The existing undo auto-dismiss effect used 10 seconds. Keep the same
// behavior and shorten only the display duration to 3 seconds.
const oldTimeout = "window.setTimeout(() => setUndoAction(null), 10000)";
const newTimeout = "window.setTimeout(() => setUndoAction(null), 3000)";

if (source.includes(oldTimeout)) {
  source = source.replace(oldTimeout, newTimeout);
}

// Idempotency/safety: accept an already-patched source, but fail if neither
// known timeout exists so we don't silently ship a no-op patch.
if (!source.includes(newTimeout)) {
  throw new Error("Could not locate the undo auto-dismiss timeout in Home.tsx");
}

fs.writeFileSync(filePath, source);
console.log("Undo notification timeout set to 3 seconds.");
