import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export type VolunteerTimeslot = Readonly<{
  id: string;
  label: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "scheduled" | "cancelled";
  sort_order: number;
}>;

export type VolunteerPackage = Readonly<{
  id: string;
  title: string;
  slug: string;
  venue: string;
  navigation_destination: string;
  has_sign_in_pin: boolean;
  has_sign_out_pin: boolean;
  timeslots: VolunteerTimeslot[];
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

export function timeslotEffectiveEnd(timeslot: VolunteerTimeslot): string {
  return timeslot.ends_at ?? timeslot.starts_at;
}

function scheduledTimeslots(volunteerPackage: VolunteerPackage): VolunteerTimeslot[] {
  return volunteerPackage.timeslots.filter(({ status }) => status === "scheduled");
}

export function sortTimeslots(timeslots: readonly VolunteerTimeslot[]): VolunteerTimeslot[] {
  return [...timeslots].sort((left, right) =>
    left.starts_at.localeCompare(right.starts_at) ||
    left.sort_order - right.sort_order ||
    left.id.localeCompare(right.id),
  );
}

function firstRelevantStart(volunteerPackage: VolunteerPackage, threshold: string): string {
  return scheduledTimeslots(volunteerPackage).find(
    (timeslot) => timeslotEffectiveEnd(timeslot) >= threshold,
  )?.starts_at ?? scheduledTimeslots(volunteerPackage)[0]?.starts_at ?? "";
}

function latestEnd(volunteerPackage: VolunteerPackage): string {
  return scheduledTimeslots(volunteerPackage).reduce(
    (latest, timeslot) =>
      timeslotEffectiveEnd(timeslot) > latest ? timeslotEffectiveEnd(timeslot) : latest,
    "",
  );
}

export function groupVolunteerPackages(
  packages: readonly VolunteerPackage[],
  now = new Date(),
): VolunteerPackageGroups {
  const todayStart = startOfSingaporeDayIso(now);
  const tomorrowStart = nextSingaporeDayIso(now);
  const recentCutoff = recentlyCompletedCutoffIso(now);
  const today = packages
    .filter((volunteerPackage) =>
      scheduledTimeslots(volunteerPackage).some(
        (timeslot) =>
          timeslot.starts_at < tomorrowStart &&
          timeslotEffectiveEnd(timeslot) >= todayStart,
      ),
    )
    .sort((left, right) =>
      firstRelevantStart(left, todayStart).localeCompare(firstRelevantStart(right, todayStart)),
    );
  const todayIds = new Set(today.map(({ id }) => id));
  const upcoming = packages
    .filter((volunteerPackage) =>
      !todayIds.has(volunteerPackage.id) &&
      scheduledTimeslots(volunteerPackage).some(
        (timeslot) => timeslot.starts_at >= tomorrowStart,
      ),
    )
    .sort((left, right) =>
      firstRelevantStart(left, tomorrowStart).localeCompare(firstRelevantStart(right, tomorrowStart)),
    );
  const visibleIds = new Set([...today, ...upcoming].map(({ id }) => id));
  const recentlyCompleted = packages
    .filter((volunteerPackage) => {
      if (visibleIds.has(volunteerPackage.id) || scheduledTimeslots(volunteerPackage).length === 0) return false;
      const completedAt = latestEnd(volunteerPackage);
      return completedAt >= recentCutoff && completedAt < todayStart;
    })
    .sort((left, right) => latestEnd(right).localeCompare(latestEnd(left)));
  return { today, upcoming, recentlyCompleted };
}

export function getPackageListingStatus(
  schedule: readonly VolunteerTimeslot[] | string | null,
  isPublished: boolean,
  now = new Date(),
): string {
  if (!isPublished) return "Draft";
  const timeslots = Array.isArray(schedule)
    ? schedule
    : schedule
      ? [{ id: "legacy", label: null, starts_at: schedule, ends_at: null, status: "scheduled" as const, sort_order: 0 }]
      : [];
  if (timeslots.length === 0) return "Published — schedule missing";
  const groups = groupVolunteerPackages([{
    id: "status",
    title: "Status",
    slug: "status",
    venue: "Status",
    navigation_destination: "Status",
    has_sign_in_pin: false,
    has_sign_out_pin: false,
    timeslots: sortTimeslots(timeslots),
  }], now);
  if (groups.today.length > 0) return "Published — visible today";
  if (groups.upcoming.length > 0) return "Published — upcoming";
  if (groups.recentlyCompleted.length > 0) return "Published — recently completed";
  return "Published — past, hidden from listing";
}

export function singaporeDateKey(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatTimeslotDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

export function formatTimeslotDayHeading(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

export function formatTimeslotTimeRange(timeslot: VolunteerTimeslot): string {
  const formatter = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
  });
  const start = formatter.format(new Date(timeslot.starts_at));
  return timeslot.ends_at ? `${start}–${formatter.format(new Date(timeslot.ends_at))}` : start;
}

export async function getVisibleVolunteerPackages(now = new Date()): Promise<VolunteerPackageGroups> {
  const admin = getPhaseOneAdminClient();
  const { data: events, error: eventsError } = await admin
    .from("phaseone_events")
    .select("id, title, slug, venue, navigation_destination, has_sign_in_pin, has_sign_out_pin")
    .eq("is_published", true)
    .not("venue", "is", null)
    .not("navigation_destination", "is", null)
    .limit(200);
  if (eventsError || !events) {
    console.error("Unable to load volunteer packages", { code: eventsError?.code });
    throw new Error("Volunteer packages could not be loaded");
  }
  if (events.length === 0) return { today: [], upcoming: [], recentlyCompleted: [] };
  const { data: timeslots, error: timeslotsError } = await admin
    .from("phaseone_event_timeslots")
    .select("id, event_id, label, starts_at, ends_at, status, sort_order")
    .in("event_id", events.map(({ id }) => id))
    .order("starts_at", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(20000);
  if (timeslotsError || !timeslots) {
    console.error("Unable to load volunteer package timeslots", { code: timeslotsError?.code });
    throw new Error("Volunteer package schedules could not be loaded");
  }
  const timeslotsByEvent = new Map<string, VolunteerTimeslot[]>();
  for (const timeslot of timeslots) {
    const current = timeslotsByEvent.get(timeslot.event_id) ?? [];
    current.push(timeslot as VolunteerTimeslot);
    timeslotsByEvent.set(timeslot.event_id, current);
  }
  const packages = events
    .map((event) => ({
      ...event,
      venue: event.venue as string,
      navigation_destination: event.navigation_destination as string,
      timeslots: sortTimeslots(timeslotsByEvent.get(event.id) ?? []),
    }))
    .filter(({ timeslots: eventTimeslots }) => eventTimeslots.length > 0) as VolunteerPackage[];
  return groupVolunteerPackages(packages, now);
}
