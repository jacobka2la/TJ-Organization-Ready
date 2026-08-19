import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

const marker = "function FilePreviewModal({";
if (!source.includes(marker)) {
  console.warn("DOCX preview patch skipped: FilePreviewModal not found.");
  process.exit(0);
}

if (!source.includes("function DocxPreview({")) {
  const component = `function DocxPreview({ url, fileName }: { url: string; fileName: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<\"loading\" | \"ready\" | \"error\">(\"loading\");
  const [errorMessage, setErrorMessage] = useState(\"\");

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = \"\";
    setStatus(\"loading\");
    setErrorMessage(\"\");

    const renderDocument = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(\`Could not load document (\${response.status}).\`);
        const blob = await response.blob();
        if (cancelled || !containerRef.current) return;

        const moduleUrl = \"https://esm.sh/docx-preview@0.3.6\";
        const docx = await import(/* @vite-ignore */ moduleUrl);
        if (cancelled || !containerRef.current) return;

        await docx.renderAsync(blob, containerRef.current, undefined, {
          inWrapper: true,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          ignoreLastRenderedPageBreak: false,
          useBase64URL: true,
        });

        if (!cancelled) setStatus(\"ready\");
      } catch (error) {
        if (cancelled) return;
        setStatus(\"error\");
        setErrorMessage(error instanceof Error ? error.message : \"Could not preview this Word document.\");
      }
    };

    void renderDocument();
    return () => {
      cancelled = true;
      if (container) container.innerHTML = \"\";
    };
  }, [url]);

  return (
    <div className=\"relative min-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-200/60 p-4\">
      {status === \"loading\" && (
        <div className=\"absolute inset-4 z-10 flex items-center justify-center rounded-xl bg-white/95 text-center text-slate-500\">
          <div>
            <FileUp className=\"mx-auto mb-3 h-10 w-10 animate-pulse text-blue-600\" />
            <p className=\"font-black text-slate-700\">Loading Word preview...</p>
            <p className=\"mt-1 text-sm\">{fileName}</p>
          </div>
        </div>
      )}
      {status === \"error\" && (
        <div className=\"flex min-h-[65vh] items-center justify-center rounded-xl bg-white text-center text-slate-500\">
          <div className=\"max-w-md px-6\">
            <FileUp className=\"mx-auto mb-3 h-10 w-10 text-blue-600\" />
            <p className=\"font-black text-slate-700\">Word preview could not load.</p>
            <p className=\"mt-2 text-sm\">{errorMessage}</p>
            <p className=\"mt-2 text-xs text-slate-400\">You can still use Download above.</p>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className={\`docx-preview-host mx-auto min-h-[65vh] \${status === \"error\" ? \"hidden\" : \"block\"}\`}
      />
    </div>
  );
}

`;
  source = source.replace(marker, component + marker);
}

if (!source.includes("const isDocx =")) {
  source = source.replace(
    '  const isText = file.type?.startsWith("text/");',
    '  const isText = file.type?.startsWith("text/");\n  const isDocx = file.name.toLowerCase().endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";'
  );
}

if (!source.includes(") : isDocx ? (")) {
  source = source.replace(
    '          ) : isText ? (\n            <iframe',
    '          ) : isDocx ? (\n            <DocxPreview url={file.dataUrl!} fileName={file.name} />\n          ) : isText ? (\n            <iframe'
  );
}

if (!source.includes("file.dataUrl && (isPdf || isDocx)")) {
  source = source.replace(
    '{file.dataUrl && isPdf && (',
    '{file.dataUrl && (isPdf || isDocx) && ('
  );
  source = source.replace(
    '>\n                Open\n              </a>',
    '>\n                Open\n              </a>'
  );
}

fs.writeFileSync(filePath, source);
console.log("DOCX preview patch applied.");
