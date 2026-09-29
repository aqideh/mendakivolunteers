import "server-only";

import { cache } from "react";
import { z } from "zod";

import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const professionalEventSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  summary: z.string(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  venue: z.string().nullable(),
  cta_label: z.string(),
  cta_url: z.string().url().nullable(),
  sort_order: z.number(),
});

export type ProfessionalEvent = z.infer<typeof professionalEventSchema>;

export const getPublishedProfessionalEvents = cache(async (): Promise<ProfessionalEvent[]> => {
  const supabase = getPhaseOneAdminClient();

  const { data, error } = await supabase
    .schema("content")
    .from("professional_events")
    .select("id, title, summary, starts_at, ends_at, venue, cta_label, cta_url, sort_order")
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });

  if (error || !data) {
    console.error("Unable to load Professional Network events", {
      code: error?.code,
      message: error?.message,
    });
    throw new Error("Professional Network events could not be loaded.");
  }

  return z.array(professionalEventSchema).parse(data);
});
