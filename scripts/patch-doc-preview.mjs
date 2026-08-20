import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes('const isLegacyDoc =')) {
  source = source.replace(
    '  const isText = file.type?.startsWith("text/");',
    '  const isText = file.type?.startsWith("text/");\n  const isLegacyDoc = file.name.toLowerCase().endsWith(".doc") || file.type === "application/msword";'
  );
}

if (!source.includes('const legacyDocViewerUrl =')) {
  source = source.replace(
    '  const isLegacyDoc = file.name.toLowerCase().endsWith(".doc") || file.type === "application/msword";',
    '  const isLegacyDoc = file.name.toLowerCase().endsWith(".doc") || file.type === "application/msword";\n  const legacyDocViewerUrl = isLegacyDoc && file.dataUrl\n    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(file.dataUrl)}`\n    : "";'
  );
}

if (!source.includes('Legacy Word preview uses Microsoft Office')) {
  source = source.replace(
    '          ) : isText ? (\n            <iframe',
    '          ) : isLegacyDoc && legacyDocViewerUrl ? (\n            <div className="space-y-2">\n              <p className="text-xs font-bold text-slate-500">Legacy Word preview uses Microsoft Office online viewer.</p>\n              <iframe\n                src={legacyDocViewerUrl}\n                title={file.name}\n                className="h-[70vh] w-full rounded-2xl border border-slate-200 bg-white"\n              />\n            </div>\n          ) : isText ? (\n            <iframe'
  );
}

fs.writeFileSync(filePath, source);
console.log("Legacy DOC preview patch applied.");
