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
}>;

type PhaseOneOpportunityOverride = Readonly<{
  external_opportunity_id: string;
  title: string | null;
  summary: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  schedule_text: string | null;
  venue: string | null;
  is_visible: boolean;
  sort_order: number | null;
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
      phaseone_opportunity_overrides: {
        Row: PhaseOneOpportunityOverride & {
          updated_by: string | null;
          created_at: string;
          updated_at: string;
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

export function mergeOpportunityOverrides(
  opportunities: readonly PhaseOneOpportunity[],
  overrides: readonly PhaseOneOpportunityOverride[],
): PhaseOneOpportunity[] {
  const overrideById = new Map(
    overrides.map((override) => [override.external_opportunity_id, override]),
  );
  const sourceIndex = new Map(opportunities.map((opportunity, index) => [opportunity.id, index]));

  return opportunities
    .filter((opportunity) => overrideById.get(opportunity.id)?.is_visible !== false)
    .map((opportunity) => {
      const override = overrideById.get(opportunity.id);
      if (!override) return opportunity;

      return {
        ...opportunity,
        title: override.title ?? opportunity.title,
        summary: override.summary ?? opportunity.summary,
        image_url: override.image_url ?? opportunity.image_url,
        starts_at: override.starts_at ?? opportunity.starts_at,
        ends_at: override.ends_at ?? opportunity.ends_at,
        schedule_text: override.schedule_text ?? opportunity.schedule_text,
        venue: override.venue ?? opportunity.venue,
      };
    })
    .sort((left, right) => {
      const leftOrder = overrideById.get(left.id)?.sort_order ?? null;
      const rightOrder = overrideById.get(right.id)?.sort_order ?? null;

      if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      if (leftOrder !== null && rightOrder === null) return -1;
      if (leftOrder === null && rightOrder !== null) return 1;

      return (sourceIndex.get(left.id) ?? 0) - (sourceIndex.get(right.id) ?? 0);
    });
}

export async function getUpcomingPhaseOneOpportunities(): Promise<
  PhaseOneOpportunity[]
> {
  const supabase = (await createClient()) as unknown as SupabaseClient<PhaseOneDatabase>;
  const opportunitiesResult = await supabase
    .from("phaseone_external_opportunities")
    .select(
      "id, title, summary, image_url, starts_at, ends_at, schedule_text, venue, source_url, imported_at",
    )
    .eq("is_active", true)
    .order("starts_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (opportunitiesResult.error) {
    console.error("Unable to load phase-one opportunities", {
      code: opportunitiesResult.error.code,
    });
    throw new Error("Volunteer opportunities could not be loaded");
  }

  const opportunityIds = opportunitiesResult.data.map((opportunity) => opportunity.id);
  if (opportunityIds.length === 0) {
    return [];
  }

  const overridesResult = await supabase
    .from("phaseone_opportunity_overrides")
    .select(
      "external_opportunity_id, title, summary, image_url, starts_at, ends_at, schedule_text, venue, is_visible, sort_order",
    )
    .in("external_opportunity_id", opportunityIds);

  if (overridesResult.error) {
    console.error("Unable to load opportunity card overrides", {
      code: overridesResult.error.code,
    });
    throw new Error("Volunteer opportunities could not be loaded");
  }

  return mergeOpportunityOverrides(opportunitiesResult.data, overridesResult.data);
}
