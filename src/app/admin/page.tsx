import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "Admin",
};

export const dynamic = "force-dynamic";

type EventRow = Readonly<{
  id: string;
  title: string;
  slug: string;
  venue: string | null;
  is_published: boolean;
  is_opportunity_published: boolean;
}>;

type TimeslotRow = Readonly<{
  id: string;
  event_id: string;
  label: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  registration_capacity: number | null;
}>;

type RosterRow = Readonly<{
  id: string;
  event_id: string;
  timeslot_id: string | null;
  volunteer_name: string;
}>;

type RegistrationRow = Readonly<{
  id: string;
  volunteer_id: string;
  event_id: string;
  status: string;
  submitted_at: string;
}>;

type AttendanceAuditRow = Readonly<{
  id: string;
  roster_id: string;
  event_id: string;
  action: string;
  changed_at: string;
}>;

type AttendanceRow = Readonly<{
  signed_in_at: string | null;
  signed_out_at: string | null;
}>;

type ActivityItem = Readonly<{
  id: string;
  at: string;
  text: string;
  href: string;
}>;

function singaporeDateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function singaporeMonthStartIso(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return new Date(`${get("year")}-${get("month")}-01T00:00:00+08:00`).toISOString();
}

function eventDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function eventTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function actionLabel(action: string): string {
  if (action === "mark_sign_in") return "checked in";
  if (action === "mark_sign_out") return "checked out";
  if (action === "clear_sign_in") return "had a sign-in corrected";
  if (action === "clear_sign_out") return "had a sign-out corrected";
  return action.replaceAll("_", " ");
}

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login?next=%2Fadmin");
  }

  const [accountResult, rolesResult] = await Promise.all([
    supabase
      .schema("core")
      .from("user_accounts")
      .select("status")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", userId),
  ]);

  if (accountResult.error || rolesResult.error) {
    throw new Error("Admin access could not be verified");
  }

  const roles = (rolesResult.data ?? []).map(({ role }) => role as AppRole);
  const isAdmin = roles.includes("admin");
  const canAccessAdmin = isAdmin || roles.includes("volteam");

  if (accountResult.data?.status !== "active" || !canAccessAdmin) {
    redirect("/dashboard");
  }

  const admin = getPhaseOneAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const todayKey = singaporeDateKey(now);
  const monthStartIso = singaporeMonthStartIso(now);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    eventsResult,
    timeslotsResult,
    volunteerCountResult,
    registrationMonthCountResult,
    pendingCountResult,
    waitlistedCountResult,
    reconciliationCountResult,
    recentRegistrationsResult,
    attendanceMonthResult,
    attendanceAuditResult,
  ] = await Promise.all([
    admin
      .from("phaseone_events")
      .select(
        "id, title, slug, venue, is_published, is_opportunity_published",
      )
      .limit(2000),
    admin
      .from("phaseone_event_timeslots")
      .select(
        "id, event_id, label, starts_at, ends_at, status, registration_capacity",
      )
      .eq("status", "scheduled")
      .order("starts_at", { ascending: true })
      .limit(20000),
    admin
      .schema("core")
      .from("volunteers")
      .select("id", { count: "exact", head: true }),
    admin
      .from("keluarga_registrations")
      .select("id", { count: "exact", head: true })
      .gte("submitted_at", monthStartIso),
    admin
      .from("keluarga_registrations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("keluarga_registrations")
      .select("id", { count: "exact", head: true })
      .eq("status", "waitlisted"),
    admin
      .schema("core")
      .from("account_link_cases")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "needs_review"])
      .not("submitted_for_review_at", "is", null),
    admin
      .from("keluarga_registrations")
      .select("id, volunteer_id, event_id, status, submitted_at")
      .order("submitted_at", { ascending: false })
      .limit(10),
    admin
      .from("phaseone_attendance_effective")
      .select("signed_in_at, signed_out_at")
      .not("signed_in_at", "is", null)
      .not("signed_out_at", "is", null)
      .gte("signed_out_at", monthStartIso)
      .limit(10000),
    admin
      .from("phaseone_attendance_audit")
      .select("id, roster_id, event_id, action, changed_at")
      .order("changed_at", { ascending: false })
      .limit(10),
  ]);

  const criticalResults = [
    eventsResult,
    timeslotsResult,
    volunteerCountResult,
    registrationMonthCountResult,
    pendingCountResult,
    waitlistedCountResult,
    reconciliationCountResult,
    recentRegistrationsResult,
    attendanceMonthResult,
    attendanceAuditResult,
  ];
  if (criticalResults.some((result) => result.error)) {
    console.error("Unable to load admin dashboard", {
      events: eventsResult.error?.code,
      timeslots: timeslotsResult.error?.code,
      volunteers: volunteerCountResult.error?.code,
      registrationsMonth: registrationMonthCountResult.error?.code,
      pending: pendingCountResult.error?.code,
      waitlisted: waitlistedCountResult.error?.code,
      reconciliation: reconciliationCountResult.error?.code,
      recentRegistrations: recentRegistrationsResult.error?.code,
      attendanceMonth: attendanceMonthResult.error?.code,
      attendanceAudit: attendanceAuditResult.error?.code,
    });
    throw new Error("Admin dashboard could not be loaded");
  }

  const events = (eventsResult.data ?? []) as EventRow[];
  const timeslots = (timeslotsResult.data ?? []) as TimeslotRow[];
  const recentRegistrations = (recentRegistrationsResult.data ?? []) as RegistrationRow[];
  const attendanceMonth = (attendanceMonthResult.data ?? []) as AttendanceRow[];
  const attendanceAudit = (attendanceAuditResult.data ?? []) as AttendanceAuditRow[];

  const eventById = new Map(events.map((event) => [event.id, event]));
  const todayTimeslots = timeslots.filter(
    (timeslot) => singaporeDateKey(timeslot.starts_at) === todayKey,
  );
  const todayEventIds = Array.from(new Set(todayTimeslots.map((timeslot) => timeslot.event_id)));

  const futureTimeslots = timeslots.filter((timeslot) => timeslot.starts_at >= nowIso);
  const upcomingFirstTimeslotByEvent = new Map<string, TimeslotRow>();
  for (const timeslot of futureTimeslots) {
    if (!upcomingFirstTimeslotByEvent.has(timeslot.event_id)) {
      upcomingFirstTimeslotByEvent.set(timeslot.event_id, timeslot);
    }
  }

  const upcomingEvents = Array.from(upcomingFirstTimeslotByEvent.entries())
    .map(([eventId, firstTimeslot]) => ({
      event: eventById.get(eventId),
      firstTimeslot,
    }))
    .filter(
      (
        item,
      ): item is Readonly<{ event: EventRow; firstTimeslot: TimeslotRow }> =>
        Boolean(item.event),
    )
    .sort((left, right) =>
      left.firstTimeslot.starts_at.localeCompare(right.firstTimeslot.starts_at),
    );

  const upcomingEventIds = upcomingEvents.slice(0, 5).map(({ event }) => event.id);
  const sevenDayEventIds = upcomingEvents
    .filter(({ firstTimeslot }) => new Date(firstTimeslot.starts_at) <= sevenDaysFromNow)
    .map(({ event }) => event.id);

  const rosterEventIds = Array.from(new Set([...todayEventIds, ...upcomingEventIds]));
  const recentVolunteerIds = Array.from(
    new Set(recentRegistrations.map((registration) => registration.volunteer_id)),
  );
  const auditRosterIds = Array.from(
    new Set(attendanceAudit.map((audit) => audit.roster_id)),
  );

  const [rosterResult, recentVolunteersResult, auditRosterResult] = await Promise.all([
    rosterEventIds.length
      ? admin
          .from("phaseone_roster")
          .select("id, event_id, timeslot_id, volunteer_name")
          .in("event_id", rosterEventIds)
          .limit(20000)
      : Promise.resolve({ data: [] as RosterRow[], error: null }),
    recentVolunteerIds.length
      ? admin
          .schema("core")
          .from("volunteers")
          .select("id, display_name")
          .in("id", recentVolunteerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null }>, error: null }),
    auditRosterIds.length
      ? admin
          .from("phaseone_roster")
          .select("id, event_id, timeslot_id, volunteer_name")
          .in("id", auditRosterIds)
      : Promise.resolve({ data: [] as RosterRow[], error: null }),
  ]);

  if (rosterResult.error || recentVolunteersResult.error || auditRosterResult.error) {
    throw new Error("Admin dashboard supporting data could not be loaded");
  }

  const rosterRows = (rosterResult.data ?? []) as RosterRow[];
  const auditRosterRows = (auditRosterResult.data ?? []) as RosterRow[];
  const volunteerNameById = new Map(
    (recentVolunteersResult.data ?? []).map((volunteer) => [
      volunteer.id,
      volunteer.display_name ?? "Volunteer",
    ]),
  );
  const rosterNameById = new Map(
    auditRosterRows.map((roster) => [roster.id, roster.volunteer_name]),
  );

  const rosterCountByEvent = new Map<string, number>();
  const rosterCountByTimeslot = new Map<string, number>();
  for (const roster of rosterRows) {
    rosterCountByEvent.set(
      roster.event_id,
      (rosterCountByEvent.get(roster.event_id) ?? 0) + 1,
    );
    if (roster.timeslot_id) {
      rosterCountByTimeslot.set(
        roster.timeslot_id,
        (rosterCountByTimeslot.get(roster.timeslot_id) ?? 0) + 1,
      );
    }
  }

  const capacityByEvent = new Map<string, number>();
  for (const timeslot of timeslots) {
    if (timeslot.registration_capacity === null) continue;
    capacityByEvent.set(
      timeslot.event_id,
      (capacityByEvent.get(timeslot.event_id) ?? 0) + timeslot.registration_capacity,
    );
  }

  const todayRosterCount = todayTimeslots.reduce(
    (sum, timeslot) => sum + (rosterCountByTimeslot.get(timeslot.id) ?? 0),
    0,
  );

  const recordedHoursThisMonth = attendanceMonth.reduce((total, attendance) => {
    if (!attendance.signed_in_at || !attendance.signed_out_at) return total;
    const signedIn = Math.max(
      new Date(attendance.signed_in_at).getTime(),
      new Date(monthStartIso).getTime(),
    );
    const signedOut = new Date(attendance.signed_out_at).getTime();
    if (!Number.isFinite(signedIn) || !Number.isFinite(signedOut) || signedOut <= signedIn) {
      return total;
    }
    return total + (signedOut - signedIn) / 3_600_000;
  }, 0);

  const emptyRosterEvents = sevenDayEventIds
    .map((eventId) => eventById.get(eventId))
    .filter(
      (event): event is EventRow =>
        Boolean(event && (rosterCountByEvent.get(event.id) ?? 0) === 0),
    );
  const unpublishedGuides = sevenDayEventIds
    .map((eventId) => eventById.get(eventId))
    .filter((event): event is EventRow => Boolean(event && !event.is_published));

  const activities: ActivityItem[] = [
    ...recentRegistrations.map((registration) => {
      const volunteerName =
        volunteerNameById.get(registration.volunteer_id) ?? "Volunteer";
      const eventName = eventById.get(registration.event_id)?.title ?? "an activity";
      return {
        id: `registration-${registration.id}`,
        at: registration.submitted_at,
        text: `${volunteerName} registered for ${eventName}`,
        href: `/admin/registrations?event=${registration.event_id}`,
      };
    }),
    ...attendanceAudit.map((audit) => {
      const volunteerName = rosterNameById.get(audit.roster_id) ?? "Volunteer";
      const eventName = eventById.get(audit.event_id)?.title ?? "an event";
      return {
        id: `attendance-${audit.id}`,
        at: audit.changed_at,
        text: `${volunteerName} ${actionLabel(audit.action)} at ${eventName}`,
        href: `/admin/events/${audit.event_id}/attendance`,
      };
    }),
  ]
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, 8);

  const attentionCount =
    (pendingCountResult.count ?? 0) +
    (waitlistedCountResult.count ?? 0) +
    (reconciliationCountResult.count ?? 0) +
    emptyRosterEvents.length +
    unpublishedGuides.length;

  return (
    <main className={`page-frame ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <h1>Admin dashboard</h1>
          <p>What is happening, what needs attention and what to do next.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.primaryAction} href="/admin/events/new">
            + New programme
          </Link>
          <Link className={styles.secondaryAction} href="/admin/events/quick">
            Quick manual event
          </Link>
        </div>
      </header>

      <section className={styles.heroGrid} aria-label="Today and needs attention">
        <div className={styles.todayCard}>
          <div className={styles.cardHeading}>
            <div>
              <h2>Today</h2>
              <p>{todayEventIds.length ? `${todayEventIds.length} active event${todayEventIds.length === 1 ? "" : "s"}` : "No events scheduled today"}</p>
            </div>
            <span className={styles.todayDate}>{eventDate(now.toISOString())}</span>
          </div>

          <div className={styles.todayMetrics}>
            <div>
              <strong>{todayEventIds.length}</strong>
              <span>events</span>
            </div>
            <div>
              <strong>{todayRosterCount}</strong>
              <span>rostered</span>
            </div>
          </div>

          {todayEventIds.length ? (
            <div className={styles.todayList}>
              {todayEventIds.slice(0, 3).map((eventId) => {
                const event = eventById.get(eventId);
                const firstTodaySlot = todayTimeslots.find(
                  (timeslot) => timeslot.event_id === eventId,
                );
                if (!event || !firstTodaySlot) return null;
                return (
                  <Link
                    className={styles.todayEvent}
                    href={`/admin/events/${event.id}/attendance`}
                    key={event.id}
                  >
                    <span>
                      <strong>{event.title}</strong>
                      <small>
                        {eventTime(firstTodaySlot.starts_at)}
                        {event.venue ? ` · ${event.venue}` : ""}
                      </small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className={styles.emptyCopy}>
              The next scheduled event appears below under Upcoming events.
            </p>
          )}

          <Link className={styles.cardLink} href="/admin/events">
            Open Event Operations →
          </Link>
        </div>

        <div className={styles.attentionCard}>
          <div className={styles.cardHeading}>
            <div>
              <h2>Needs attention</h2>
              <p>{attentionCount ? `${attentionCount} items to review` : "Nothing urgent right now"}</p>
            </div>
            <span className={`${styles.attentionBadge} ${attentionCount === 0 ? styles.attentionClear : ""}`}>
              {attentionCount}
            </span>
          </div>

          <div className={styles.attentionList}>
            <Link href="/admin/registrations">
              <span>Pending registrations</span>
              <strong>{pendingCountResult.count ?? 0}</strong>
            </Link>
            <Link href="/admin/registrations">
              <span>Waitlisted registrations</span>
              <strong>{waitlistedCountResult.count ?? 0}</strong>
            </Link>
            <Link href="/admin/reconciliation">
              <span>Volunteer profiles for reconciliation</span>
              <strong>{reconciliationCountResult.count ?? 0}</strong>
            </Link>
            <Link href="/admin/events">
              <span>Events in next 7 days with no roster</span>
              <strong>{emptyRosterEvents.length}</strong>
            </Link>
            <Link href="/admin/events">
              <span>Event guides not published</span>
              <strong>{unpublishedGuides.length}</strong>
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="glance-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="glance-title">At a glance</h2>
            <p>Current Keluarga activity.</p>
          </div>
        </div>
        <div className={styles.metricGrid}>
          <div className={styles.metric}>
            <strong>{volunteerCountResult.count ?? 0}</strong>
            <span>Volunteers</span>
          </div>
          <div className={styles.metric}>
            <strong>{registrationMonthCountResult.count ?? 0}</strong>
            <span>Registrations this month</span>
          </div>
          <div className={styles.metric}>
            <strong>{Math.round(recordedHoursThisMonth * 10) / 10}h</strong>
            <span>Recorded hours this month</span>
          </div>
          <div className={styles.metric}>
            <strong>{upcomingEvents.length}</strong>
            <span>Upcoming events</span>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="upcoming-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="upcoming-title">Upcoming events</h2>
            <p>Next scheduled activities and roster readiness.</p>
          </div>
          <Link href="/admin/events">View all</Link>
        </div>

        <div className={styles.eventTable}>
          {upcomingEvents.slice(0, 5).map(({ event, firstTimeslot }) => {
            const rosterCount = rosterCountByEvent.get(event.id) ?? 0;
            const capacity = capacityByEvent.get(event.id);
            return (
              <Link
                className={styles.eventRow}
                href={`/admin/events/${event.id}/attendance`}
                key={event.id}
              >
                <span className={styles.eventDate}>
                  <strong>{eventDate(firstTimeslot.starts_at)}</strong>
                  <small>{eventTime(firstTimeslot.starts_at)}</small>
                </span>
                <span className={styles.eventName}>
                  <strong>{event.title}</strong>
                  <small>{event.venue ?? "Venue not set"}</small>
                </span>
                <span className={styles.rosterStatus}>
                  <strong>
                    {capacity !== undefined ? `${rosterCount} / ${capacity}` : rosterCount}
                  </strong>
                  <small>{capacity !== undefined ? "roster / capacity" : "rostered"}</small>
                </span>
                <span className={styles.eventArrow} aria-hidden="true">→</span>
              </Link>
            );
          })}
          {upcomingEvents.length === 0 ? (
            <div className={styles.emptyRow}>No upcoming events are scheduled.</div>
          ) : null}
        </div>
      </section>

      <div className={styles.lowerGrid}>
        <section className={styles.section} aria-labelledby="activity-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="activity-title">Recent activity</h2>
              <p>Latest registrations and attendance actions.</p>
            </div>
          </div>
          <div className={styles.activityList}>
            {activities.map((activity) => (
              <Link href={activity.href} key={activity.id}>
                <span className={styles.activityDot} aria-hidden="true" />
                <span className={styles.activityCopy}>
                  <strong>{activity.text}</strong>
                  <small>{formatSingaporeDateTime(activity.at)}</small>
                </span>
              </Link>
            ))}
            {activities.length === 0 ? (
              <div className={styles.emptyRow}>No recent admin activity.</div>
            ) : null}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="quick-title">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="quick-title">Quick actions</h2>
              <p>Start common workflows.</p>
            </div>
          </div>
          <div className={styles.quickActions}>
            <Link href="/admin/events/new">
              <strong>New programme</strong>
              <span>Create an activity and its shifts.</span>
            </Link>
            <Link href="/admin/events/quick">
              <strong>Quick manual event</strong>
              <span>Set up a simple operational event.</span>
            </Link>
            <Link href="/admin/events/import">
              <strong>Import events</strong>
              <span>Bring in event records in bulk.</span>
            </Link>
            {isAdmin ? (
              <Link href="/admin/staff">
                <strong>Invite staff</strong>
                <span>Manage Keluarga access.</span>
              </Link>
            ) : (
              <Link href="/admin/volunteers">
                <strong>Volunteer directory</strong>
                <span>Find and review volunteer records.</span>
              </Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
