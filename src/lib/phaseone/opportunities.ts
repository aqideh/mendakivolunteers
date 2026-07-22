import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type PhaseOneOpportunity = Readonly<{
  id: string;
  title: string;
  summary: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue: string | null;
  source_url: string;
  imported_at: string;
}>;

type PhaseOneDatabase = {
  public: {
    Tables: {
      phaseone_external_opportunities: {
        Row: PhaseOneOpportunity & {
          source_key: string;
          source_updated_at: string | null;
          is_active: boolean;
          raw_payload: Record<string, unknown>;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export async function getUpcomingPhaseOneOpportunities(
  now = new Date(),
): Promise<PhaseOneOpportunity[]> {
  const supabase = (await createClient()) as unknown as SupabaseClient<PhaseOneDatabase>;
  const { data, error } = await supabase
    .from("phaseone_external_opportunities")
    .select(
      "id, title, summary, image_url, starts_at, ends_at, venue, source_url, imported_at",
    )
    .eq("is_active", true)
    .gte("starts_at", now.toISOString())
    .order("starts_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Unable to load phase-one opportunities", { code: error.code });
    throw new Error("Volunteer opportunities could not be loaded");
  }

  return data;
}
