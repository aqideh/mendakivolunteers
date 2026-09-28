import { createClient } from "@supabase/supabase-js";

import { getPublicConfig } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Email links are opened outside the server action that requested them and may
 * be opened in a different tab or browser. Do not bind these links to a PKCE
 * verifier cookie created by the server action.
 *
 * The confirmation page already accepts the implicit-flow access/refresh token
 * fragment and persists it through the browser Supabase client.
 */
export function createEmailLinkClient() {
  const { supabaseUrl, supabasePublishableKey } = getPublicConfig();

  return createClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
