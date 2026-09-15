import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { deriveAttendanceExceptions, type ReconciliationException } from "@/lib/phaseone/attendance-exceptions";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import styles from "../attendance-ops.module.css";

export const metadata: Metadata = { title: "Attendance reconciliation" };
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

type Props = { params: Promise<{ id: string }> };
type Timeslot = { id: string; label: string | null; starts_at: string; ends_at: string | null; status: string };
type Effective = { roster_id: string; signed_in_at: string | null; signed_out_at: string | null; non_attendance_status: string | null; session_checked_in_at: string | null; session_checked_out_at: string | null };
type Roster = { id: string; timeslot_id: string; volunteer_name: string; volunteer_key: string | null; email: string | null; mobile: string | null; attendance_person_key: string; entry_method: string };

type ExceptionRow = {
  key: string;
  volunteer: Roster;
  slot: Timeslot;
  issue: ReconciliationException;
};

function singaporeDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}

function shiftLabel(slot: Timeslot) {
  return slot.label?.trim() || `${timeLabel(slot.starts_at)}${slot.ends_at ? `–${timeLabel(slot.ends_at)}` : ""}`;
}

function earliest(values: string[]) {
  return values.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
}

function latest(values: string[]) {
  return values.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function currentTimeMs() {
  return Date.now();
}

export default async function AttendanceReconciliationPage({ params }: Props) {
  const { id } = await params;
  await requireEventManager(`/admin/events/${id}/attendance/reconcile`);
  const admin = getPhaseOneAdminClient();
  const [eventResult, slotsResult, rosterResult, attendanceResult] = await Promise.all([
    admin.from("phaseone_events").select("id, title, venue").eq("id", id).maybeSingle(),
    admin.from("phaseone_event_timeslots").select("id, label, starts_at, ends_at, status").eq("event_id", id).order("starts_at"),
    admin.from("phaseone_roster").select("id, timeslot_id, volunteer_name, volunteer_key, email, mobile, attendance_person_key, entry_method").eq("event_id", id).limit(5000),
    admin.from("phaseone_attendance_effective").select("roster_id, signed_in_at, signed_out_at, non_attendance_status, session_checked_in_at, session_checked_out_at").eq("event_id", id).limit(5000),
  ]);

  if (eventResult.error) throw new Error("Event could not be loaded");
  if (!eventResult.data) notFound();
  if (slotsResult.error || rosterResult.error || attendanceResult.error) throw new Error("Attendance reconciliation data could not be loaded");

  const slots = (slotsResult.data ?? []).filter((slot) => slot.status !== "cancelled") as Timeslot[];
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const roster = (rosterResult.data ?? []) as Roster[];
  const effectiveByRoster = new Map((attendanceResult.data as Effective[]).map((row) => [row.roster_id, row]));
  const duplicateCount = new Map<string, number>();
  for (const row of roster) {
    const duplicateKey = `${row.timeslot_id}:${row.attendance_person_key}`;
    duplicateCount.set(duplicateKey, (duplicateCount.get(duplicateKey) ?? 0) + 1);
  }

  const windows = new Map<string, { starts: string[]; ends: string[] }>();
  for (const row of roster) {
    const slot = slotById.get(row.timeslot_id);
    if (!slot) continue;
    const key = `${row.attendance_person_key}:${singaporeDateKey(slot.starts_at)}`;
    const current = windows.get(key) ?? { starts: [], ends: [] };
    current.starts.push(slot.starts_at);
    current.ends.push(slot.ends_at ?? slot.starts_at);
    windows.set(key, current);
  }

  const nowMs = currentTimeMs();
  const exceptions: ExceptionRow[] = [];
  const seen = new Set<string>();

  for (const volunteer of roster) {
    const slot = slotById.get(volunteer.timeslot_id);
    if (!slot) continue;
    const attendance = effectiveByRoster.get(volunteer.id);
    const dateKey = singaporeDateKey(slot.starts_at);
    const window = windows.get(`${volunteer.attendance_person_key}:${dateKey}`);
    const issues = deriveAttendanceExceptions({
      nowMs,
      shiftStartsAt: slot.starts_at,
      shiftEndsAt: slot.ends_at,
      signedInAt: attendance?.signed_in_at ?? null,
      signedOutAt: attendance?.signed_out_at ?? null,
      nonAttendanceStatus: attendance?.non_attendance_status ?? null,
      duplicateShiftIdentity: (duplicateCount.get(`${volunteer.timeslot_id}:${volunteer.attendance_person_key}`) ?? 0) > 1,
      sessionCheckedInAt: attendance?.session_checked_in_at ?? null,
      sessionCheckedOutAt: attendance?.session_checked_out_at ?? null,
      scheduledWindowStartsAt: window ? earliest([...window.starts]) : slot.starts_at,
      scheduledWindowEndsAt: window ? latest([...window.ends]) : slot.ends_at,
    });

    for (const issue of issues) {
      const personLevel = issue.kind === "open_session" || issue.kind === "outside_scheduled_window";
      const issueKey = personLevel
        ? `${volunteer.attendance_person_key}:${dateKey}:${issue.kind}:${issue.title}`
        : `${volunteer.id}:${issue.kind}:${issue.title}`;
      if (seen.has(issueKey)) continue;
      seen.add(issueKey);
      exceptions.push({ key: issueKey, volunteer, slot, issue });
    }
  }

  const severityOrder = { high: 0, medium: 1, low: 2 } as const;
  exceptions.sort((a, b) => severityOrder[a.issue.severity] - severityOrder[b.issue.severity] || a.volunteer.volunteer_name.localeCompare(b.volunteer.volunteer_name));

  const high = exceptions.filter((row) => row.issue.severity === "high").length;
  const medium = exceptions.filter((row) => row.issue.severity === "medium").length;
  const low = exceptions.filter((row) => row.issue.severity === "low").length;
  const openSessions = exceptions.filter((row) => row.issue.kind === "open_session").length;
  const missingAttendance = exceptions.filter((row) => row.issue.kind === "missing_attendance").length;
  const event = eventResult.data;

  return (
    <div className="site-shell">
      <PortalHeader status="Attendance reconciliation" dashboard />
      <main className="page-frame phaseone-operations-page">
        <div className="dashboard-header phaseone-operations-header">
          <div><p className="eyebrow">Attendance reconciliation</p><h1>{event.title}</h1><p className="muted">Resolve attendance exceptions before treating event hours as final.</p></div>
          <div className="actions"><Link className="button button-secondary" href={`/admin/events/${id}/attendance/monitor`}>Live monitor</Link><Link className="button button-primary" href={`/admin/events/${id}/attendance`}>Open roster</Link></div>
        </div>

        <section className={`metric-grid ${styles.metrics}`} aria-label="Attendance exception totals">
          <article className="metric-card"><span className="metric-value">{exceptions.length}</span><span className="metric-label">Exceptions</span></article>
          <article className="metric-card"><span className="metric-value">{high}</span><span className="metric-label">High priority</span></article>
          <article className="metric-card"><span className="metric-value">{openSessions}</span><span className="metric-label">Open sessions</span></article>
          <article className="metric-card"><span className="metric-value">{missingAttendance}</span><span className="metric-label">Missing attendance</span></article>
          <article className="metric-card"><span className="metric-value">{medium}</span><span className="metric-label">Medium</span></article>
          <article className="metric-card"><span className="metric-value">{low}</span><span className="metric-label">Review only</span></article>
        </section>

        {exceptions.length === 0 ? (
          <section className="notice notice-success" role="status"><strong>No attendance exceptions detected.</strong> Current roster, attendance and event-day sessions are internally consistent.</section>
        ) : (
          <section className="panel phaseone-admin-section" aria-labelledby="exceptions-title">
            <div className="section-header"><div><p className="eyebrow">Review queue</p><h2 id="exceptions-title">Exceptions requiring attention</h2></div><span className="status-pill">{exceptions.length} unresolved</span></div>
            <div className={styles.exceptionList}>
              {exceptions.map(({ key, volunteer, slot, issue }) => (
                <article className={styles.exceptionRow} data-severity={issue.severity} key={key}>
                  <div className={styles.exceptionMain}>
                    <div className={styles.exceptionTitle}><span className={styles.severity}>{issue.severity}</span><strong>{issue.title}</strong></div>
                    <h3>{volunteer.volunteer_name}</h3>
                    <p>{shiftLabel(slot)} · {timeLabel(slot.starts_at)}{slot.ends_at ? `–${timeLabel(slot.ends_at)}` : ""}{volunteer.entry_method === "walk_in" ? " · Walk-in" : ""}</p>
                    <p className="muted">{issue.detail}</p>
                  </div>
                  <div className={styles.exceptionActions}>
                    <Link className="button button-primary" href={`/admin/events/${id}/attendance?timeslot=${encodeURIComponent(slot.id)}&highlight=${encodeURIComponent(volunteer.id)}`}>Review volunteer</Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="panel phaseone-admin-section" aria-labelledby="rules-title">
          <div className="section-header"><div><p className="eyebrow">How this works</p><h2 id="rules-title">Derived reconciliation rules</h2></div></div>
          <div className={styles.ruleGrid}>
            <div><strong>High</strong><p>Open sessions after scheduled end, duplicate shift identities, or impossible check-in/check-out ordering.</p></div>
            <div><strong>Medium</strong><p>Completed shifts with no attendance and no absent/withdrawn status.</p></div>
            <div><strong>Review only</strong><p>Event-day attendance more than 90 minutes outside the volunteer&apos;s scheduled window.</p></div>
          </div>
          <p className="muted">There is no separate “resolve” button. Correct the underlying attendance or roster record and the exception disappears automatically, preserving one source of truth and the existing audit trail.</p>
        </section>
      </main>
    </div>
  );
}
