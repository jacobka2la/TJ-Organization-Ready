import { supabase } from "@/lib/supabase";

type GoogleCalendarStatus = {
  connected: boolean;
};

type GoogleCalendarSyncResult = {
  synced: number;
};

async function invokeAuthenticated<T>(functionName: string) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw sessionError;
  if (!session) {
    throw new Error("Your session expired. Please log in again.");
  }

  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) throw error;
  return data;
}

export async function getGoogleCalendarStatus() {
  const data = await invokeAuthenticated<GoogleCalendarStatus>(
    "google-calendar-status",
  );

  return { connected: Boolean(data?.connected) };
}

export async function connectGoogleCalendar() {
  const data = await invokeAuthenticated<{ url: string }>(
    "google-calendar-connect",
  );

  if (!data?.url) {
    throw new Error("Google Calendar authorization URL was not returned.");
  }

  return data.url;
}

export async function syncGoogleCalendar() {
  const data = await invokeAuthenticated<GoogleCalendarSyncResult>(
    "google-calendar-sync",
  );

  return { synced: data?.synced ?? 0 };
}
