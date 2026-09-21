import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type PhaseOneOpportunity = Readonly<{
  id: string;
  title: string;
  summary: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  schedule_text: string | null;
  venue: string | null;
  source_url: string;
  imported_at: string;
  sort_order: number | null;
  has_manual_override: boolean;
}>;

type PhaseOneDatabase = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      list_phaseone_opportunities: {
        Args: Record<never, never>;
        Returns: PhaseOneOpportunity[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export async function getUpcomingPhaseOneOpportunities(): Promise<
  PhaseOneOpportunity[]
> {
  const supabase = (await createClient()) as unknown as SupabaseClient<PhaseOneDatabase>;
  const { data, error } = await supabase.rpc("list_phaseone_opportunities");

  if (error) {
    console.error("Unable to load phase-one opportunities", { code: error.code });
    throw new Error("Volunteer opportunities could not be loaded");
  }

  return data;
}
