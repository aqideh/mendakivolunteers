import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getPublicConfig } from "@/lib/env";

let adminClient: SupabaseClient | null = null;

export function getPhaseOneAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const { supabaseUrl } = getPublicConfig();
  const serviceRoleKey = z
    .string()
    .min(1)
    .parse(process.env.SUPABASE_SERVICE_ROLE_KEY);

  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return adminClient;
}

export function getPhaseOneServerSecret(): string {
  return z.string().min(32).parse(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
