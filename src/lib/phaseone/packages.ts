import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export type VolunteerPackage = Readonly<{
  id: string;
  title: string;
  slug: string;
  reporting_at: string;
  venue: string;
  navigation_destination: string;
  has_sign_in_pin: boolean;
  has_sign_out_pin: boolean;
}>;

export type VolunteerPackageGroups = Readonly<{
  today: VolunteerPackage[];
  upcoming: VolunteerPackage[];
  recentlyCompleted: VolunteerPackage[];
}>;

export const recentlyCompletedPackageDays = 7;

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

export function nextSingaporeDayIso(now = new Date()): string {
  const start = new Date(startOfSingaporeDayIso(now));
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString();
}

export function recentlyCompletedCutoffIso(now = new Date()): string {
  const start = new Date(startOfSingaporeDayIso(now));
  start.setUTCDate(start.getUTCDate() - recentlyCompletedPackageDays);
  return start.toISOString();
}

export function groupVolunteerPackages(
  packages: readonly VolunteerPackage[],
  now = new Date(),
): VolunteerPackageGroups {
  const todayStart = startOfSingaporeDayIso(now);
  const tomorrowStart = nextSingaporeDayIso(now);

  return {
    today: packages.filter(
      ({ reporting_at }) => reporting_at >= todayStart && reporting_at < tomorrowStart,
    ),
    upcoming: packages.filter(({ reporting_at }) => reporting_at >= tomorrowStart),
    recentlyCompleted: packages
      .filter(({ reporting_at }) => reporting_at < todayStart)
      .sort((left, right) => right.reporting_at.localeCompare(left.reporting_at)),
  };
}

export function getPackageListingStatus(
  reportingAt: string | null,
  isPublished: boolean,
  now = new Date(),
): string {
  if (!isPublished) return "Draft";
  if (!reportingAt) return "Published — reporting time missing";

  const todayStart = startOfSingaporeDayIso(now);
  const tomorrowStart = nextSingaporeDayIso(now);
  const recentCutoff = recentlyCompletedCutoffIso(now);

  if (reportingAt >= todayStart && reportingAt < tomorrowStart) {
    return "Published — visible today";
  }
  if (reportingAt >= tomorrowStart) return "Published — upcoming";
  if (reportingAt >= recentCutoff) return "Published — recently completed";
  return "Published — past, hidden from listing";
}

export async function getVisibleVolunteerPackages(
  now = new Date(),
): Promise<VolunteerPackageGroups> {
  const supabase = getPhaseOneAdminClient();
  const { data, error } = await supabase
    .from("phaseone_events")
    .select(
      "id, title, slug, reporting_at, venue, navigation_destination, has_sign_in_pin, has_sign_out_pin",
    )
    .eq("is_published", true)
    .not("reporting_at", "is", null)
    .not("venue", "is", null)
    .not("navigation_destination", "is", null)
    .gte("reporting_at", recentlyCompletedCutoffIso(now))
    .order("reporting_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);

  if (error) {
    console.error("Unable to load volunteer packages", { code: error.code });
    throw new Error("Volunteer packages could not be loaded");
  }

  return groupVolunteerPackages((data ?? []) as VolunteerPackage[], now);
}
