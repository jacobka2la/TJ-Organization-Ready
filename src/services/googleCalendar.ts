import { supabase } from "@/lib/supabase";

type GoogleCalendarStatus = {
  connected: boolean;
};

type GoogleCalendarSyncResult = {
  synced: number;
};

export async function getGoogleCalendarStatus() {
  const { data, error } = await supabase.functions.invoke<GoogleCalendarStatus>(
    "google-calendar-status",
  );

  if (error) throw error;
  return { connected: Boolean(data?.connected) };
}

export async function connectGoogleCalendar() {
  const { data, error } = await supabase.functions.invoke<{ url: string }>(
    "google-calendar-connect",
  );

  if (error) throw error;
  if (!data?.url) {
    throw new Error("Google Calendar authorization URL was not returned.");
  }

  return data.url;
}

export async function syncGoogleCalendar() {
  const { data, error } = await supabase.functions.invoke<GoogleCalendarSyncResult>(
    "google-calendar-sync",
  );

  if (error) throw error;
  return { synced: data?.synced ?? 0 };
}
