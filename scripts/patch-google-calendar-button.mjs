import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

const serviceImport = 'import { getGoogleCalendarStatus, connectGoogleCalendar } from "@/services/googleCalendar";';
if (!source.includes(serviceImport)) {
  const anchor = 'import { getCurrentSession, loginWithEmail, logout } from "@/services/auth";';
  if (!source.includes(anchor)) throw new Error("Could not find auth import anchor");
  source = source.replace(anchor, `${anchor}\n${serviceImport}`);
}

const stateAnchor = '  const [isEventModalOpen, setIsEventModalOpen] = useState(false);';
const stateBlock = `\n  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);\n  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);`;
if (!source.includes('googleCalendarConnected')) {
  if (!source.includes(stateAnchor)) throw new Error("Could not find calendar state anchor");
  source = source.replace(stateAnchor, stateAnchor + stateBlock);
}

const handlerAnchor = '  const offerUndo = (message: string, undo: () => Promise<void>) => {';
const handlers = `  useEffect(() => {\n    if (!isLoggedIn) return;\n    let active = true;\n    getGoogleCalendarStatus().then(({ connected }) => {\n      if (active) setGoogleCalendarConnected(connected);\n    }).catch(() => {});\n    return () => { active = false; };\n  }, [isLoggedIn]);\n\n  const handleConnectGoogleCalendar = async () => {\n    setGoogleCalendarLoading(true);\n    setAppError(\"\");\n    try {\n      const url = await connectGoogleCalendar();\n      window.location.assign(url);\n    } catch (error) {\n      setAppError(error instanceof Error ? error.message : \"Could not connect Google Calendar.\");\n      setGoogleCalendarLoading(false);\n    }\n  };\n\n`;
if (!source.includes('handleConnectGoogleCalendar')) {
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

const buttonOld = `<button onClick={() => openNewEvent()} className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 font-black text-white hover:bg-blue-700">\n          <Plus className="h-5 w-5" /> Add Event\n        </button>`;
const buttonNew = `<div className="flex flex-col gap-2 sm:flex-row">\n          <button\n            onClick={onConnectGoogleCalendar}\n            disabled={googleCalendarConnected || googleCalendarLoading}\n            className={\`flex items-center justify-center gap-2 rounded-2xl border px-5 py-4 font-black transition \${googleCalendarConnected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700"} disabled:cursor-default\`}\n          >\n            <CalendarDays className="h-5 w-5" />\n            {googleCalendarConnected ? "Google Calendar Connected" : googleCalendarLoading ? "Connecting..." : "Connect Google Calendar"}\n          </button>\n          <button onClick={() => openNewEvent()} className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 font-black text-white hover:bg-blue-700">\n            <Plus className="h-5 w-5" /> Add Event\n          </button>\n        </div>`;
if (!source.includes('Google Calendar Connected')) {
  if (!source.includes(buttonOld)) throw new Error("Could not find Add Event button anchor");
  source = source.replace(buttonOld, buttonNew);
}

fs.writeFileSync(filePath, source);
console.log("Google Calendar connect button applied.");
