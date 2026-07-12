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