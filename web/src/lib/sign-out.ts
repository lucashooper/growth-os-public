"use client";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/** Clear the Supabase session and cookies, then leave the app. */
export async function signOutAndLeave() {
  try {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
  } catch {
    /* still hit the cookie-clearing route */
  }
  window.location.href = "/api/auth/signout";
}
