import fs from "node:fs";

const homePath = "src/pages/Home.tsx";
const eventsPath = "src/services/events.ts";
const googlePath = "src/services/googleCalendar.ts";

let home = fs.readFileSync(homePath, "utf8");
let events = fs.readFileSync(eventsPath, "utf8");
let google = fs.readFileSync(googlePath, "utf8");

if (!google.includes("export async function syncGoogleCalendarEvent")) {
  google += `\nexport async function syncGoogleCalendarEvent(eventId: string, action: \"upsert\" | \"delete\" = \"upsert\") {\n  const { data, error } = await supabase.functions.invoke<{ synced?: boolean; deleted?: boolean; error?: string }>(\n    \"google-calendar-event-sync\",\n    { body: { eventId, action } },\n  );\n  if (error) throw error;\n  if (data?.error) throw new Error(data.error);\n  return data;\n}\n`;
}

if (!events.includes("reminder_minutes: number | null;")) {
  events = events.replace(
    "  notes: string | null;\n  deleted_at: string | null;",
    "  notes: string | null;\n  reminder_minutes: number | null;\n  deleted_at: string | null;",
  );
}
if (!events.includes("reminder_minutes?: number | null;")) {
  events = events.replace(
    "  notes?: string | null;\n}) {",
    "  notes?: string | null;\n  reminder_minutes?: number | null;\n}) {",
  );
}

// Add the per-event sync helper to whatever Google Calendar import the previous patch produced.
if (!home.includes("syncGoogleCalendarEvent } from \"@/services/googleCalendar\"")) {
  home = home.replace(
    /import \{ ([^}]*?) \} from "@\/services\/googleCalendar";/,
    (_match, names) => {
      const parts = names.split(",").map((name) => name.trim()).filter(Boolean);
      if (!parts.includes("syncGoogleCalendarEvent")) parts.push("syncGoogleCalendarEvent");
      return `import { ${parts.join(", ")} } from "@/services/googleCalendar";`;
    },
  );
}

if (!home.includes("reminderMinutes: number | null;")) {
  home = home.replace(
    "  notes: string;\n};\n\ntype EventForm",
    "  notes: string;\n  reminderMinutes: number | null;\n};\n\ntype EventForm",
  );
}
if (!home.includes("  reminderMinutes: null,\n};\n\nconst EVENT_TYPES")) {
  home = home.replace(
    '  notes: "",\n};\n\nconst EVENT_TYPES',
    '  notes: "",\n  reminderMinutes: null,\n};\n\nconst EVENT_TYPES',
  );
}
if (!home.includes("reminderMinutes: row.reminder_minutes ?? null")) {
  home = home.replace(
    '  notes: row.notes || "",\n});',
    '  notes: row.notes || "",\n  reminderMinutes: row.reminder_minutes ?? null,\n});',
  );
}
if (!home.includes("reminderMinutes: event.reminderMinutes,")) {
  home = home.replace(
    "      notes: event.notes,\n    });",
    "      notes: event.notes,\n      reminderMinutes: event.reminderMinutes,\n    });",
  );
}
if (!home.includes("reminder_minutes: eventForm.reminderMinutes")) {
  home = home.replace(
    "      notes: eventForm.notes.trim() || null,\n    };",
    "      notes: eventForm.notes.trim() || null,\n      reminder_minutes: eventForm.reminderMinutes,\n    };",
  );
}

if (!home.includes("syncGoogleCalendarEvent(saved.id, \"upsert\")")) {
  home = home.replace(
    "    const saved = calendarEventFromRow(result.data as EventRow);\n    setEvents((current) =>",
    "    const saved = calendarEventFromRow(result.data as EventRow);\n    syncGoogleCalendarEvent(saved.id, \"upsert\").catch((syncError) => {\n      console.error(\"Could not sync TJ event to Google Calendar:\", syncError);\n      setAppError(\"Event saved in TJ, but Google Calendar sync failed. Try Sync Google Calendar or edit/save the event again.\");\n    });\n    setEvents((current) =>",
  );
}
if (!home.includes("syncGoogleCalendarEvent(event.id, \"delete\")")) {
  home = home.replace(
    "    setEvents((current) => current.filter((item) => item.id !== event.id));",
    "    syncGoogleCalendarEvent(event.id, \"delete\").catch((syncError) => {\n      console.error(\"Could not delete Google Calendar copy:\", syncError);\n    });\n    setEvents((current) => current.filter((item) => item.id !== event.id));",
  );
}

if (!home.includes(">Reminder</span><select value={form.reminderMinutes")) {
  const locationLabel = '<label className="md:col-span-2"><span className="mb-2 block text-sm font-black text-slate-600">Location (optional)</span>';
  const reminder = `<label><span className="mb-2 block text-sm font-black text-slate-600">Reminder</span><select value={form.reminderMinutes ?? ""} onChange={(e) => setForm((current) => ({ ...current, reminderMinutes: e.target.value === "" ? null : Number(e.target.value) }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600"><option value="">None</option><option value="0">At time of event</option><option value="5">5 minutes before</option><option value="10">10 minutes before</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="120">2 hours before</option><option value="1440">1 day before</option><option value="2880">2 days before</option><option value="10080">1 week before</option></select></label>\n          <div className="hidden md:block" />\n          `;
  if (!home.includes(locationLabel)) throw new Error("Could not find EventModal location anchor for reminder dropdown");
  home = home.replace(locationLabel, reminder + locationLabel);
}

if (!home.includes("syncGoogleCalendarEvent")) throw new Error("Google Calendar event sync import was not applied");
if (!home.includes("reminderMinutes")) throw new Error("Reminder UI/data patch was not applied");

fs.writeFileSync(homePath, home);
fs.writeFileSync(eventsPath, events);
fs.writeFileSync(googlePath, google);
console.log("Two-way Google Calendar sync and phone reminder dropdown applied.");
