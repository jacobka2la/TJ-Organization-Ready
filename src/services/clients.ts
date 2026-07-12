import { supabase } from "@/lib/supabase";

export type ClientRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  email: string | null;
  date_of_birth: string | null;
  date_of_incident: string | null;
  ssn: string | null;
  case_type: string | null;
  status: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getClients() {
  return supabase
    .from("clients")
    .select("*")
    .is("deleted_at", null)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
}

export async function createClient(input: {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  email?: string;
  date_of_birth?: string;
  date_of_incident?: string;
  ssn?: string;
  case_type?: string;
  status?: string;
}) {
  return supabase.from("clients").insert(input).select().single();
}

export async function updateClient(
  id: string,
  input: Partial<Omit<ClientRow, "id" | "created_at" | "updated_at">>,
) {
  return supabase
    .from("clients")
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
}

export async function softDeleteClient(id: string) {
  return supabase
    .from("clients")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function restoreClient(id: string) {
  return supabase
    .from("clients")
    .update({
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}