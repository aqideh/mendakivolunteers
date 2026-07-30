import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export type VolunteerPackage = Readonly<{
  id: string;
  title: string;
  slug: string;
  reporting_at: string;
  venue: string | null;
  has_pin: boolean;
}>;

export function startOfSingaporeDayIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00+08:00`).toISOString();
}

export async function getUpcomingVolunteerPackages(
  now = new Date(),
): Promise<VolunteerPackage[]> {
  const supabase = getPhaseOneAdminClient();
  const { data, error } = await supabase
    .from("phaseone_events")
    .select("id, title, slug, reporting_at, venue, has_pin")
    .eq("is_published", true)
    .not("reporting_at", "is", null)
    .gte("reporting_at", startOfSingaporeDayIso(now))
    .order("reporting_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Unable to load volunteer packages", { code: error.code });
    throw new Error("Volunteer packages could not be loaded");
  }

  return (data ?? []) as VolunteerPackage[];
}
