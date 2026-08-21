import { supabase } from "@/lib/supabase";

export type EventRow = {
  id: string;
  client_id: string | null;
  title: string;
  event_type: string;
  start_at: string;
  end_at: string | null;
  location: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  google_event_id?: string | null;
  google_calendar_id?: string | null;
  sync_source?: string;
  google_updated_at?: string | null;
};

export async function getEvents() {
  return supabase
    .from("events")
    .select("*")
    .is("deleted_at", null)
    .order("start_at", { ascending: true });
}

export async function createEvent(input: {
  client_id?: string | null;
  title: string;
  event_type: string;
  start_at: string;
  end_at?: string | null;
  location?: string | null;
  notes?: string | null;
}) {
  return supabase.from("events").insert(input).select().single();
}

export async function updateEvent(
  id: string,
  input: Partial<Omit<EventRow, "id" | "created_at" | "updated_at" | "deleted_at">>,
) {
  return supabase
    .from("events")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
}

export async function softDeleteEvent(id: string) {
  return supabase
    .from("events")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function restoreEvent(id: string) {
  return supabase
    .from("events")
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function getGoogleCalendarStatus() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { connected: false };

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-status`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  );

  if (!response.ok) return { connected: false };
  return response.json() as Promise<{ connected: boolean; calendarId?: string }>;
}

export async function connectGoogleCalendar() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("You must be logged in to connect Google Calendar.");

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-connect`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Could not start Google Calendar connection.");
  }

  const { url } = await response.json();
  if (!url) throw new Error("Google Calendar authorization URL was not returned.");
  window.location.assign(url);
}
