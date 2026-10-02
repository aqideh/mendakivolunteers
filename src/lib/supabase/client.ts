import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

function getBrowserConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase browser configuration is unavailable.");
  }

  return { supabaseUrl, supabasePublishableKey };
}

export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = getBrowserConfig();
  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}

export function createAuthCallbackClient() {
  const { supabaseUrl, supabasePublishableKey } = getBrowserConfig();

  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey, {
    isSingleton: false,
    auth: {
      // /auth/confirm explicitly exchanges/verifies the credentials in the URL.
      // Prevent Supabase's browser initializer from consuming them in parallel.
      detectSessionInUrl: false,
    },
  });
}
