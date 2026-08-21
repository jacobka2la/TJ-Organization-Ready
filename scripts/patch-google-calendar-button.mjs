import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

const desiredImport = 'import { getGoogleCalendarStatus, connectGoogleCalendar, syncGoogleCalendar } from "@/services/googleCalendar";';
const oldImport = 'import { getGoogleCalendarStatus, connectGoogleCalendar } from "@/services/googleCalendar";';
if (source.includes(oldImport)) {
  source = source.replace(oldImport, desiredImport);
} else if (!source.includes(desiredImport)) {
  const anchor = 'import { getCurrentSession, loginWithEmail, logout } from "@/services/auth";';
  if (!source.includes(anchor)) throw new Error("Could not find auth import anchor");
  source = source.replace(anchor, `${anchor}\n${desiredImport}`);
}

const stateAnchor = '  const [isEventModalOpen, setIsEventModalOpen] = useState(false);';
const stateBlock = `\n  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);\n  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);`;
if (!source.includes('const [googleCalendarConnected')) {
  if (!source.includes(stateAnchor)) throw new Error("Could not find calendar state anchor");
  source = source.replace(stateAnchor, stateAnchor + stateBlock);
}

const handlerAnchor = '  const offerUndo = (message: string, undo: () => Promise<void>) => {';
const handlers = `  useEffect(() => {\n    if (!isLoggedIn) return;\n    let active = true;\n\n    (async () => {\n      try {\n        const { connected } = await getGoogleCalendarStatus();\n        if (!active) return;\n        setGoogleCalendarConnected(connected);\n        if (connected) {\n          await syncGoogleCalendar();\n          if (active) await loadWorkspace();\n        }\n      } catch {\n        // Keep the normal TJ calendar usable even if Google sync has a temporary issue.\n      }\n    })();\n\n    return () => { active = false; };\n  }, [isLoggedIn]);\n\n  const handleConnectGoogleCalendar = async () => {\n    setGoogleCalendarLoading(true);\n    setAppError(\"\");\n    try {\n      if (googleCalendarConnected) {\n        const { synced } = await syncGoogleCalendar();\n        await loadWorkspace();\n        offerUndo(\`Synced \${synced} Google Calendar \${synced === 1 ? \"event\" : \"events\"}.\`, async () => {});\n        setGoogleCalendarLoading(false);\n        return;\n      }\n\n      const url = await connectGoogleCalendar();\n      window.location.assign(url);\n    } catch (error) {\n      setAppError(error instanceof Error ? error.message : \"Could not sync Google Calendar.\");\n      setGoogleCalendarLoading(false);\n    }\n  };\n\n`;

// Remove the older generated Google Calendar effect/handler if present, then insert the current version.
source = source.replace(/  useEffect\(\(\) => \{\n    if \(!isLoggedIn\) return;\n    let active = true;\n    getGoogleCalendarStatus\(\)[\s\S]*?  \};\n\n(?=  const offerUndo)/, "");
source = source.replace(/  useEffect\(\(\) => \{\n    if \(!isLoggedIn\) return;[\s\S]*?  const handleConnectGoogleCalendar = async \(\) => \{[\s\S]*?\n  \};\n\n(?=  const offerUndo)/, "");
if (!source.includes('const handleConnectGoogleCalendar = async () => {')) {
  if (!source.includes(handlerAnchor)) throw new Error("Could not find handler anchor");
  source = source.replace(handlerAnchor, handlers + handlerAnchor);
}

const oldProps = `            openClient={openClient}\n          />`;
const newProps = `            openClient={openClient}\n            googleCalendarConnected={googleCalendarConnected}\n            googleCalendarLoading={googleCalendarLoading}\n            onConnectGoogleCalendar={handleConnectGoogleCalendar}\n          />`;
if (!source.includes('googleCalendarConnected={googleCalendarConnected}')) {
  if (!source.includes(oldProps)) throw new Error("Could not find CalendarPage props anchor");
  source = source.replace(oldProps, newProps);
}

const sigOld = `  openEditEvent,\n  openClient,\n}: {`;
const sigNew = `  openEditEvent,\n  openClient,\n  googleCalendarConnected,\n  googleCalendarLoading,\n  onConnectGoogleCalendar,\n}: {`;
if (!source.includes('  googleCalendarConnected,\n  googleCalendarLoading,')) {
  if (!source.includes(sigOld)) throw new Error("Could not find CalendarPage signature anchor");
  source = source.replace(sigOld, sigNew);
}

const typeOld = `  openEditEvent: (event: CalendarEvent) => void;\n  openClient: (clientId: string) => void;\n}) {`;
const typeNew = `  openEditEvent: (event: CalendarEvent) => void;\n  openClient: (clientId: string) => void;\n  googleCalendarConnected: boolean;\n  googleCalendarLoading: boolean;\n  onConnectGoogleCalendar: () => void;\n}) {`;
if (!source.includes('  googleCalendarConnected: boolean;')) {
  if (!source.includes(typeOld)) throw new Error("Could not find CalendarPage type anchor");
  source = source.replace(typeOld, typeNew);
}

const addEventButton = `<button onClick={() => openNewEvent()} className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 font-black text-white hover:bg-blue-700">\n          <Plus className="h-5 w-5" /> Add Event\n        </button>`;
const oldCalendarButtons = /<div className="flex flex-col gap-2 sm:flex-row">\n          <button\n            onClick=\{onConnectGoogleCalendar\}[\s\S]*?<Plus className="h-5 w-5" \/> Add Event\n          <\/button>\n        <\/div>/;
const calendarButtons = `<div className="flex flex-col gap-2 sm:flex-row">\n          <button\n            onClick={onConnectGoogleCalendar}\n            disabled={googleCalendarLoading}\n            className={\`flex items-center justify-center gap-2 rounded-2xl border px-5 py-4 font-black transition \${googleCalendarConnected ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700"} disabled:cursor-wait disabled:opacity-70\`}\n          >\n            <CalendarDays className="h-5 w-5" />\n            {googleCalendarLoading ? "Syncing..." : googleCalendarConnected ? "Sync Google Calendar" : "Connect Google Calendar"}\n          </button>\n          <button onClick={() => openNewEvent()} className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 font-black text-white hover:bg-blue-700">\n            <Plus className="h-5 w-5" /> Add Event\n          </button>\n        </div>`;

if (oldCalendarButtons.test(source)) {
  source = source.replace(oldCalendarButtons, calendarButtons);
} else if (!source.includes('Sync Google Calendar')) {
  if (!source.includes(addEventButton)) throw new Error("Could not find Calendar Add Event button");
  source = source.replace(addEventButton, calendarButtons);
}

fs.writeFileSync(filePath, source);
console.log("Google Calendar connect and sync UI applied.");
