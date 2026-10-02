import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase browser configuration is unavailable.");
  }

  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: {
      // KELUARGA handles auth callback credentials explicitly in its callback UI.
      // Disabling automatic URL detection prevents the browser client from racing
      // that handler over recovery/invite tokens.
      detectSessionInUrl: false,
    },
  });
}
