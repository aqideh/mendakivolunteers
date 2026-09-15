import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AttendanceLiveRefresh } from "@/components/phaseone/attendance-live-refresh";
import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import styles from "../attendance-ops.module.css";

export const metadata: Metadata = { title: "Live attendance monitor" };
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

type Props = { params: Promise<{ id: string }> };
type Timeslot = { id: string; label: string | null; starts_at: string; ends_at: string | null; status: string };
type Effective = { roster_id: string; signed_in_at: string | null; signed_out_at: string | null; non_attendance_status: string | null; session_checked_in_at: string | null; session_checked_out_at: string | null };

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}

function shiftLabel(slot: Timeslot) {
  return slot.label?.trim() || `${timeLabel(slot.starts_at)}${slot.ends_at ? `–${timeLabel(slot.ends_at)}` : ""}`;
}

function statusFor(row: Effective | undefined) {
  if (row?.non_attendance_status === "withdrawn") return "withdrawn";
  if (row?.non_attendance_status === "absent") return "absent";
  if (row?.signed_out_at && !row?.signed_in_at) return "anomaly";
  if (row?.signed_out_at) return "checked_out";
  if (row?.signed_in_at) return "checked_in";
  return "pending";
}

export default async function AttendanceMonitorPage({ params }: Props) {
  const { id } = await params;
  await requireEventManager(`/admin/events/${id}/attendance/monitor`);
  const admin = getPhaseOneAdminClient();
  const [eventResult, slotsResult, rosterResult, attendanceResult, auditResult] = await Promise.all([
    admin.from("phaseone_events").select("id, title, venue").eq("id", id).maybeSingle(),
    admin.from("phaseone_event_timeslots").select("id, label, starts_at, ends_at, status").eq("event_id", id).order("starts_at"),
    admin.from("phaseone_roster").select("id, timeslot_id, volunteer_name, attendance_person_key, entry_method").eq("event_id", id).limit(5000),
    admin.from("phaseone_attendance_effective").select("roster_id, signed_in_at, signed_out_at, non_attendance_status, session_checked_in_at, session_checked_out_at").eq("event_id", id).limit(5000),
    admin.from("phaseone_attendance_audit").select("id, roster_id, action, reason, source_type, changed_at").eq("event_id", id).order("changed_at", { ascending: false }).limit(20),
  ]);

  if (eventResult.error) throw new Error("Event could not be loaded");
  if (!eventResult.data) notFound();
  if (slotsResult.error || rosterResult.error || attendanceResult.error || auditResult.error) throw new Error("Live attendance data could not be loaded");

  const slots = (slotsResult.data ?? []).filter((slot) => slot.status !== "cancelled") as Timeslot[];
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const effectiveByRoster = new Map((attendanceResult.data as Effective[]).map((row) => [row.roster_id, row]));
  const rosterById = new Map((rosterResult.data ?? []).map((row) => [row.id, row]));
  const personRows = new Map<string, typeof rosterResult.data>();
  for (const row of rosterResult.data ?? []) {
    const current = personRows.get(row.attendance_person_key) ?? [];
    current.push(row);
    personRows.set(row.attendance_person_key, current);
  }

  const onsite = [] as Array<{ key: string; name: string; since: string | null; shifts: string[]; walkIn: boolean }>;
  let checkedInPeople = 0;
  let checkedOutPeople = 0;
  let notArrivedPeople = 0;
  let nonAttendancePeople = 0;
  let anomalyPeople = 0;

  for (const [personKey, rows] of personRows) {
    const states = rows.map((row) => effectiveByRoster.get(row.id));
    const hasIn = states.some((state) => state?.signed_in_at);
    const hasOut = states.some((state) => state?.signed_out_at);
    const isOnsite = states.some((state) => state?.signed_in_at && !state?.signed_out_at && !state?.non_attendance_status);
    const hasNonAttendance = states.some((state) => state?.non_attendance_status === "absent" || state?.non_attendance_status === "withdrawn");
    const hasAnomaly = states.some((state) => state?.signed_out_at && !state?.signed_in_at);
    if (hasIn) checkedInPeople += 1;
    if (hasOut) checkedOutPeople += 1;
    if (!hasIn && !hasOut && !hasNonAttendance) notArrivedPeople += 1;
    if (hasNonAttendance) nonAttendancePeople += 1;
    if (hasAnomaly) anomalyPeople += 1;
    if (isOnsite) {
      const since = states.map((state) => state?.session_checked_in_at ?? state?.signed_in_at).filter(Boolean).sort()[0] ?? null;
      onsite.push({
        key: personKey,
        name: rows[0]?.volunteer_name ?? "Volunteer",
        since,
        shifts: Array.from(new Set(rows.map((row) => slotById.get(row.timeslot_id)).filter(Boolean).map((slot) => shiftLabel(slot!)))),
        walkIn: rows.some((row) => row.entry_method === "walk_in"),
      });
    }
  }
  onsite.sort((a, b) => (a.since ?? "").localeCompare(b.since ?? ""));

  const shiftMetrics = slots.map((slot) => {
    const rows = (rosterResult.data ?? []).filter((row) => row.timeslot_id === slot.id);
    const counts = { pending: 0, checked_in: 0, checked_out: 0, absent: 0, withdrawn: 0, anomaly: 0 };
    for (const row of rows) counts[statusFor(effectiveByRoster.get(row.id)) as keyof typeof counts] += 1;
    return { slot, roster: rows.length, counts };
  });

  const event = eventResult.data;
  const refreshedAt = new Date().toISOString();

  return (
    <div className="site-shell">
      <PortalHeader status="Live attendance monitor" dashboard />
      <main className="page-frame phaseone-operations-page">
        <div className="dashboard-header phaseone-operations-header">
          <div><p className="eyebrow">Live attendance</p><h1>{event.title}</h1><p className="muted">{event.venue ?? "Venue not set"} · refreshes every 5 seconds</p></div>
          <div className="actions"><AttendanceLiveRefresh /><Link className="button button-secondary" href={`/admin/events/${id}/attendance`}>Roster</Link><Link className="button button-primary" href={`/admin/events/${id}/attendance/reconcile`}>Reconcile</Link></div>
        </div>

        <section className={`metric-grid ${styles.metrics}`} aria-label="Live event attendance totals">
          <article className="metric-card"><span className="metric-value">{personRows.size}</span><span className="metric-label">Volunteers</span></article>
          <article className="metric-card"><span className="metric-value">{onsite.length}</span><span className="metric-label">On site now</span></article>
          <article className="metric-card"><span className="metric-value">{checkedInPeople}</span><span className="metric-label">Checked in</span></article>
          <article className="metric-card"><span className="metric-value">{checkedOutPeople}</span><span className="metric-label">Checked out</span></article>
          <article className="metric-card"><span className="metric-value">{notArrivedPeople}</span><span className="metric-label">Not arrived</span></article>
          <article className="metric-card"><span className="metric-value">{nonAttendancePeople + anomalyPeople}</span><span className="metric-label">Absent / review</span></article>
        </section>

        <div className={styles.twoColumn}>
          <section className="panel phaseone-admin-section" aria-labelledby="onsite-title">
            <div className="section-header"><div><p className="eyebrow">Current floor</p><h2 id="onsite-title">On site now · {onsite.length}</h2></div></div>
            <div className={styles.compactList}>
              {onsite.map((person) => <div className={styles.listRow} key={person.key}><div><strong>{person.name}</strong><p>{person.shifts.join(" · ")}{person.walkIn ? " · Walk-in" : ""}</p></div><span className="status-pill">Since {person.since ? timeLabel(person.since) : "—"}</span></div>)}
              {onsite.length === 0 ? <p className="empty-state">Nobody is currently checked in.</p> : null}
            </div>
          </section>

          <section className="panel phaseone-admin-section" aria-labelledby="activity-title">
            <div className="section-header"><div><p className="eyebrow">Live activity</p><h2 id="activity-title">Latest attendance changes</h2></div></div>
            <div className={styles.compactList}>
              {(auditResult.data ?? []).map((audit) => {
                const roster = rosterById.get(audit.roster_id);
                return <div className={styles.listRow} key={audit.id}><div><strong>{roster?.volunteer_name ?? "Volunteer"}</strong><p>{audit.action.replaceAll("_", " ")} · {audit.source_type === "volunteer_qr" ? "QR" : "Staff"}</p></div><span>{formatSingaporeDateTime(audit.changed_at)}</span></div>;
              })}
              {(auditResult.data ?? []).length === 0 ? <p className="empty-state">No attendance activity yet.</p> : null}
            </div>
          </section>
        </div>

        <section className="panel phaseone-admin-section" aria-labelledby="shifts-title">
          <div className="section-header"><div><p className="eyebrow">Shift status</p><h2 id="shifts-title">Deployment overview</h2></div><span className="muted">Updated {timeLabel(refreshedAt)}</span></div>
          <div className={styles.shiftGrid}>
            {shiftMetrics.map(({ slot, roster, counts }) => <article className={styles.shiftCard} key={slot.id}><div><strong>{shiftLabel(slot)}</strong><p>{timeLabel(slot.starts_at)}{slot.ends_at ? `–${timeLabel(slot.ends_at)}` : ""}</p></div><div className={styles.shiftStats}><span><b>{roster}</b> roster</span><span><b>{counts.checked_in}</b> in</span><span><b>{counts.checked_out}</b> out</span><span><b>{counts.pending}</b> pending</span></div><div className="actions"><Link className="button button-secondary" href={`/admin/events/${id}/attendance?timeslot=${encodeURIComponent(slot.id)}`}>Open roster</Link><Link className="button button-secondary" href={`/admin/events/${id}/attendance/qr?timeslot=${encodeURIComponent(slot.id)}&action=check_in`}>QR</Link></div></article>)}
          </div>
        </section>
      </main>
    </div>
  );
}
