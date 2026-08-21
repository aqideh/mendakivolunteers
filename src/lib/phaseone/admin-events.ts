import {
  sortTimeslots,
  timeslotEffectiveEnd,
  type VolunteerTimeslot,
} from "./packages";

export const adminPastEventDays = 14;

export type AdminEventSummary = Readonly<{
  id: string;
  title: string;
  slug: string;
  venue: string | null;
  reporting_at: string | null;
  has_sign_in_pin: boolean;
  has_sign_out_pin: boolean;
  briefing_available_at: string | null;
  is_published: boolean;
  updated_at: string;
  timeslots: VolunteerTimeslot[];
}>;

export function adminPastEventCutoffIso(now = new Date()): string {
  return new Date(
    now.getTime() - adminPastEventDays * 24 * 60 * 60 * 1000,
  ).toISOString();
}

export function getAdminEventScheduledTimeslots(
  event: AdminEventSummary,
): VolunteerTimeslot[] {
  return sortTimeslots(
    event.timeslots.filter(({ status }) => status === "scheduled"),
  );
}

export function getAdminEventFirstScheduledTimeslot(
  event: AdminEventSummary,
): VolunteerTimeslot | null {
  return getAdminEventScheduledTimeslots(event)[0] ?? null;
}

export function getAdminEventEffectiveEnd(
  event: AdminEventSummary,
): string | null {
  return getAdminEventScheduledTimeslots(event).reduce<string | null>(
    (latest, timeslot) => {
      const effectiveEnd = timeslotEffectiveEnd(timeslot);
      return !latest || effectiveEnd > latest ? effectiveEnd : latest;
    },
    null,
  );
}

export function isPastAdminEvent(
  event: AdminEventSummary,
  now = new Date(),
): boolean {
  const effectiveEnd = getAdminEventEffectiveEnd(event);
  return Boolean(effectiveEnd && effectiveEnd < adminPastEventCutoffIso(now));
}

export function splitAdminEvents(
  events: readonly AdminEventSummary[],
  now = new Date(),
): Readonly<{
  current: AdminEventSummary[];
  past: AdminEventSummary[];
}> {
  const current: AdminEventSummary[] = [];
  const past: AdminEventSummary[] = [];

  for (const event of events) {
    (isPastAdminEvent(event, now) ? past : current).push(event);
  }

  return { current, past };
}

export function sortCurrentAdminEvents(
  events: readonly AdminEventSummary[],
): AdminEventSummary[] {
  return [...events].sort((left, right) => {
    const leftStart = getAdminEventFirstScheduledTimeslot(left)?.starts_at;
    const rightStart = getAdminEventFirstScheduledTimeslot(right)?.starts_at;

    if (leftStart && rightStart) {
      return leftStart.localeCompare(rightStart) || left.title.localeCompare(right.title);
    }
    if (leftStart) return -1;
    if (rightStart) return 1;
    return left.title.localeCompare(right.title);
  });
}
