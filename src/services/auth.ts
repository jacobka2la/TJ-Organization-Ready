import { supabase } from "@/lib/supabase";

export async function loginWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({
    email,
    password,
  });
}

export async function logout() {
  return supabase.auth.signOut();
}

export async function getCurrentSession() {
  return supabase.auth.getSession();
}