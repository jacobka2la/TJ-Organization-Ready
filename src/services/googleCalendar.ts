import { supabase } from "@/lib/supabase";

type GoogleCalendarStatus = {
  connected: boolean;
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
