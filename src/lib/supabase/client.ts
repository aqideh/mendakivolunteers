import { createBrowserClient } from "@supabase/ssr";

import { getPublicConfig } from "@/lib/env";
import type { Database } from "@/types/database";

export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = getPublicConfig();
  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}
