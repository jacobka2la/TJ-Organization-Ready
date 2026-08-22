import fs from "node:fs";

const filePath = "src/pages/Home.tsx";
let source = fs.readFileSync(filePath, "utf8");

if (!source.includes('const [expandedDay, setExpandedDay] = useState<Date | null>(null);')) {
  source = source.replace(
    '  const year = month.getFullYear();',
    '  const [expandedDay, setExpandedDay] = useState<Date | null>(null);\n  const year = month.getFullYear();',
  );
}

source = source.replace(
  /\{dayEvents\.length > 3 && <p className="text-\[10px\] font-bold text-slate-400">\+\{dayEvents\.length - 3\} more<\/p>\}/g,
  `{dayEvents.length > 3 && (\n                      <button\n                        type="button"\n                        onClick={(event) => { event.stopPropagation(); setExpandedDay(date); }}\n                        className="w-full rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-left text-[10px] font-black text-blue-700 hover:bg-blue-100"\n                      >\n                        +{dayEvents.length - 3} more · View all\n                      </button>\n                    )}`,
);

const anchor = '        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-28 xl:self-start">';
if (!source.includes('All events for {expandedDay.toLocaleDateString')) {
  const modal = `        {expandedDay && (() => {\n          const expandedEvents = events\n            .filter((event) => new Date(event.startAt).toDateString() === expandedDay.toDateString())\n            .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());\n          return (\n            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-5 backdrop-blur-sm" onClick={() => setExpandedDay(null)}>\n              <motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} onClick={(event) => event.stopPropagation()} className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">\n                <div className="mb-5 flex items-start justify-between gap-4">\n                  <div>\n                    <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Daily Schedule</p>\n                    <h3 className="mt-1 text-3xl font-black">{expandedDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h3>\n                    <p className="mt-1 text-sm text-slate-500">All events for {expandedDay.toLocaleDateString("en-US", { month: "long", day: "numeric" })}.</p>\n                  </div>\n                  <button type="button" onClick={() => setExpandedDay(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X className="h-5 w-5" /></button>\n                </div>\n                <div className="space-y-3">\n                  {expandedEvents.map((event) => {\n                    const client = clients.find((item) => item.id === event.clientId);\n                    return (\n                      <button key={event.id} type="button" onClick={() => { setExpandedDay(null); openEditEvent(event); }} className="flex w-full items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-blue-200 hover:bg-blue-50/50">\n                        <div className="min-w-20 text-sm font-black text-slate-600">{formatEventTime(event.startAt)}</div>\n                        <div className="min-w-0 flex-1">\n                          <div className="flex flex-wrap items-center gap-2">\n                            <span className={\`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase \${eventTypeClasses[event.eventType] || eventTypeClasses.Other}\`}>{event.eventType}</span>\n                            {client && <span className="text-xs font-black text-blue-700">{clientName(client)}</span>}\n                          </div>\n                          <p className="mt-2 text-base font-black text-slate-900">{event.title}</p>\n                          {event.location && <p className="mt-1 text-sm text-slate-500">{event.location}</p>}\n                        </div>\n                      </button>\n                    );\n                  })}\n                </div>\n                <button type="button" onClick={() => { const date = new Date(expandedDay); setExpandedDay(null); openNewEvent(null, date); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Add Event This Day</button>\n              </motion.div>\n            </div>\n          );\n        })()}\n\n`;
  if (!source.includes(anchor)) throw new Error("Could not locate Calendar upcoming aside anchor");
  source = source.replace(anchor, modal + anchor);
}

if (!source.includes('setExpandedDay(date)')) throw new Error("Expanded day button patch did not apply");

fs.writeFileSync(filePath, source);
console.log("Calendar +X more now opens an expanded daily events view.");
