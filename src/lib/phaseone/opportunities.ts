import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type KeluargaOpportunityTimeslot = Readonly<{
  id: string;
  event_id: string;
  label: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "scheduled" | "cancelled";
  sort_order: number;
}>;

export type KeluargaOpportunity = Readonly<{
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  image_url: string | null;
  category: string | null;
  eligibility: string | null;
  venue: string | null;
  navigation_destination: string | null;
  registration_deadline: string | null;
  sort_order: number | null;
  starts_at: string;
  ends_at: string | null;
  timeslots: KeluargaOpportunityTimeslot[];
}>;

type PublicProgrammeDatabase = {
  public: {
    Tables: {
      phaseone_events: {
        Row: {
          id: string;
          title: string;
          slug: string;
          venue: string | null;
          navigation_destination: string | null;
          opportunity_summary: string | null;
          opportunity_description: string | null;
          opportunity_image_url: string | null;
          opportunity_category: string | null;
          opportunity_eligibility: string | null;
          registration_deadline: string | null;
          is_opportunity_published: boolean;
          opportunity_sort_order: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      phaseone_event_timeslots: {
        Row: KeluargaOpportunityTimeslot;
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

function effectiveEnd(timeslot: KeluargaOpportunityTimeslot): string {
  return timeslot.ends_at ?? timeslot.starts_at;
}

export async function getUpcomingPhaseOneOpportunities(
  now = new Date(),
): Promise<KeluargaOpportunity[]> {
  const supabase = (await createClient()) as unknown as SupabaseClient<PublicProgrammeDatabase>;
  const [eventsResult, timeslotsResult] = await Promise.all([
    supabase
      .from("phaseone_events")
      .select(
        "id, title, slug, venue, navigation_destination, opportunity_summary, opportunity_description, opportunity_image_url, opportunity_category, opportunity_eligibility, registration_deadline, is_opportunity_published, opportunity_sort_order",
      )
      .eq("is_opportunity_published", true)
      .limit(500),
    supabase
      .from("phaseone_event_timeslots")
      .select("id, event_id, label, starts_at, ends_at, status, sort_order")
      .eq("status", "scheduled")
      .order("starts_at", { ascending: true })
      .order("sort_order", { ascending: true })
      .limit(5000),
  ]);

  if (eventsResult.error || timeslotsResult.error) {
    console.error("Unable to load KELUARGA opportunities", {
      eventsCode: eventsResult.error?.code,
      timeslotsCode: timeslotsResult.error?.code,
    });
    throw new Error("Volunteer opportunities could not be loaded");
  }

  const timeslotsByEvent = new Map<string, KeluargaOpportunityTimeslot[]>();
  for (const timeslot of timeslotsResult.data ?? []) {
    const current = timeslotsByEvent.get(timeslot.event_id) ?? [];
    current.push(timeslot);
    timeslotsByEvent.set(timeslot.event_id, current);
  }

  const nowIso = now.toISOString();
  const opportunities: KeluargaOpportunity[] = [];

  for (const event of eventsResult.data ?? []) {
    const timeslots = (timeslotsByEvent.get(event.id) ?? []).filter(
      (timeslot) => effectiveEnd(timeslot) >= nowIso,
    );
    const first = timeslots[0];
    if (!first) continue;

    opportunities.push({
      id: event.id,
      slug: event.slug,
      title: event.title,
      summary: event.opportunity_summary,
      description: event.opportunity_description,
      image_url: event.opportunity_image_url,
      category: event.opportunity_category,
      eligibility: event.opportunity_eligibility,
      venue: event.venue,
      navigation_destination: event.navigation_destination,
      registration_deadline: event.registration_deadline,
      sort_order: event.opportunity_sort_order,
      starts_at: first.starts_at,
      ends_at: timeslots.reduce<string | null>((latest, timeslot) => {
        const end = effectiveEnd(timeslot);
        return !latest || end > latest ? end : latest;
      }, null),
      timeslots,
    });
  }

  return opportunities.sort((left, right) => {
    if (left.sort_order !== null || right.sort_order !== null) {
      if (left.sort_order === null) return 1;
      if (right.sort_order === null) return -1;
      if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
    }
    return left.starts_at.localeCompare(right.starts_at) || left.title.localeCompare(right.title);
  });
}
