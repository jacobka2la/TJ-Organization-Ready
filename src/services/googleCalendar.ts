import { supabase } from "@/lib/supabase";

type GoogleCalendarStatus = {
  connected: boolean;
};

export async function getGoogleCalendarStatus() {
  const { data, error } = await supabase.functions.invoke<GoogleCalendarStatus>(
    "google-calendar-status",
  );
  return { data, error };
}

export async function connectGoogleCalendar() {
  const { data, error } = await supabase.functions.invoke<{ url: string }>(
    "google-calendar-connect",
  );

  if (error) return { data: null, error };
  if (!data?.url) {
    return { data: null, error: new Error("Google Calendar authorization URL was not returned.") };
  }

  window.location.assign(data.url);
  return { data, error: null };
}
