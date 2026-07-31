import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { applyAttendanceChange } from "@/app/admin/events/[id]/attendance/actions";
import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = { title: "Attendance counter-check" };
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type AttendanceStatus = "pending" | "signed_in" | "signed_out" | "anomaly";

function parameter(values: Record<string, string | string[] | undefined>, key: string) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function statusFor(signedInAt: string | null, signedOutAt: string | null): AttendanceStatus {
  if (signedOutAt && !signedInAt) return "anomaly";
  if (signedOutAt) return "signed_out";
  if (signedInAt) return "signed_in";
  return "pending";
}

function statusLabel(status: AttendanceStatus): string {
  return {
    pending: "Pending",
    signed_in: "Signed in",
    signed_out: "Signed out",
    anomaly: "Needs review",
  }[status];
}

function toSingaporeDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export default async function AttendancePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  await requireEventManager(`/admin/events/${id}/attendance`);
  const admin = getPhaseOneAdminClient();
  const [eventResult, rosterResult, attendanceResult, auditResult] = await Promise.all([
    admin.from("phaseone_events").select("id, title, slug, reporting_at, venue").eq("id", id).maybeSingle(),
    admin
      .from("phaseone_roster")
      .select("id, volunteer_key, volunteer_name, email, mobile")
      .eq("event_id", id)
      .order("volunteer_name")
      .limit(2000),
    admin
      .from("phaseone_attendance")
      .select("id, roster_id, signed_in_at, signed_out_at, updated_at")
      .eq("event_id", id),
    admin
      .from("phaseone_attendance_audit")
      .select("id, roster_id, action, reason, old_signed_in_at, old_signed_out_at, new_signed_in_at, new_signed_out_at, changed_at")
      .eq("event_id", id)
      .order("changed_at", { ascending: false })
      .limit(25),
  ]);

  if (eventResult.error) throw new Error("Event could not be loaded");
  if (!eventResult.data) notFound();
  if (
    rosterResult.error || !rosterResult.data ||
    attendanceResult.error || !attendanceResult.data ||
    auditResult.error || !auditResult.data
  ) {
    throw new Error("Attendance operations data could not be loaded");
  }

  const attendanceByRoster = new Map(attendanceResult.data.map((item) => [item.roster_id, item]));
  const rosterById = new Map(rosterResult.data.map((item) => [item.id, item]));
  const records = rosterResult.data.map((volunteer) => {
    const attendance = attendanceByRoster.get(volunteer.id);
    return {
      volunteer,
      attendance,
      status: statusFor(attendance?.signed_in_at ?? null, attendance?.signed_out_at ?? null),
    };
  });

  const parameters = await searchParams;
  const query = (parameter(parameters, "q") ?? "").trim().toLowerCase();
  const requestedFilter = parameter(parameters, "status") ?? "all";
  const validFilters = new Set(["all", "pending", "signed_in", "signed_out", "anomaly"]);
  const filter = validFilters.has(requestedFilter) ? requestedFilter : "all";
  const visible = records.filter(({ volunteer, status }) => {
    const matchesStatus = filter === "all" || status === filter;
    const haystack = [volunteer.volunteer_key, volunteer.volunteer_name, volunteer.email, volunteer.mobile]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });
  const counts = records.reduce<Record<AttendanceStatus, number>>(
    (totals, record) => ({ ...totals, [record.status]: totals[record.status] + 1 }),
    { pending: 0, signed_in: 0, signed_out: 0, anomaly: 0 },
  );
  const successMessage = parameter(parameters, "success") === "attendance_updated"
    ? "Attendance record updated and audited."
    : undefined;
  const errorMessage = parameter(parameters, "error");
  const event = eventResult.data;

  return (
    <div className="site-shell">
      <PortalHeader status="Attendance counter-check" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Phase-one attendance</p>
            <h1>{event.title}</h1>
            <p className="muted">
              {event.reporting_at ? formatSingaporeDateTime(event.reporting_at) : "Reporting time not set"}
              {event.venue ? ` · ${event.venue}` : ""}
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href={`/admin/events/${id}/edit`}>Event settings</Link>
            <a className="button button-primary" href={`/admin/events/${id}/attendance/export`}>Export CSV</a>
          </div>
        </div>

        {successMessage ? <div className="notice notice-success" role="status">{successMessage}</div> : null}
        {errorMessage ? <div className="notice notice-error" role="alert">{errorMessage}</div> : null}

        <section className="metric-grid phaseone-attendance-metrics" aria-label="Attendance totals">
          <article className="metric-card"><span className="metric-value">{records.length}</span><span className="metric-label">Roster</span></article>
          <article className="metric-card"><span className="metric-value">{counts.pending}</span><span className="metric-label">Pending</span></article>
          <article className="metric-card"><span className="metric-value">{counts.signed_in}</span><span className="metric-label">Signed in</span></article>
          <article className="metric-card"><span className="metric-value">{counts.signed_out}</span><span className="metric-label">Signed out</span></article>
          <article className="metric-card"><span className="metric-value">{counts.anomaly}</span><span className="metric-label">Needs review</span></article>
        </section>

        <section className="section panel phaseone-admin-section" aria-labelledby="attendance-roster-title">
          <div className="section-header">
            <div><p className="eyebrow">Counter-check</p><h2 id="attendance-roster-title">Volunteer roster</h2></div>
            <span className="status-pill">{visible.length} shown</span>
          </div>
          <form className="phaseone-attendance-filters" method="get">
            <div className="form-field"><label htmlFor="q">Search</label><input id="q" name="q" defaultValue={query} placeholder="Name, volunteer ID, email or mobile" /></div>
            <div className="form-field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={filter}><option value="all">All</option><option value="pending">Pending</option><option value="signed_in">Signed in</option><option value="signed_out">Signed out</option><option value="anomaly">Needs review</option></select></div>
            <button className="button button-secondary" type="submit">Apply filters</button>
          </form>

          <div className="phaseone-attendance-list">
            {visible.map(({ volunteer, attendance, status }) => (
              <article className="phaseone-attendance-card" data-status={status} key={volunteer.id}>
                <div className="phaseone-attendance-summary">
                  <div><p className="record-kicker">{volunteer.volunteer_key}</p><h3>{volunteer.volunteer_name}</h3><p className="muted">{volunteer.email ?? "No email"} · {volunteer.mobile ?? "No mobile"}</p></div>
                  <span className="status-pill" data-state={status}>{statusLabel(status)}</span>
                </div>
                {status === "anomaly" ? <p className="notice notice-error">Sign-out exists without a sign-in timestamp.</p> : null}
                <dl className="phaseone-attendance-times">
                  <div><dt>Signed in</dt><dd>{attendance?.signed_in_at ? formatSingaporeDateTime(attendance.signed_in_at) : "Not recorded"}</dd></div>
                  <div><dt>Signed out</dt><dd>{attendance?.signed_out_at ? formatSingaporeDateTime(attendance.signed_out_at) : "Not recorded"}</dd></div>
                </dl>
                <form action={applyAttendanceChange} className="phaseone-attendance-correction">
                  <input name="eventId" type="hidden" value={id} />
                  <input name="rosterId" type="hidden" value={volunteer.id} />
                  <div className="form-field"><label htmlFor={`action-${volunteer.id}`}>Action</label><select id={`action-${volunteer.id}`} name="action" defaultValue={attendance?.signed_in_at ? (attendance.signed_out_at ? "clear_sign_out" : "mark_sign_out") : "mark_sign_in"}><option value="mark_sign_in">Set or correct sign-in</option><option value="mark_sign_out">Set or correct sign-out</option><option value="clear_sign_in">Clear sign-in</option><option value="clear_sign_out">Clear sign-out</option></select></div>
                  <div className="form-field"><label htmlFor={`timestamp-${volunteer.id}`}>Timestamp</label><input id={`timestamp-${volunteer.id}`} name="timestamp" type="datetime-local" defaultValue={toSingaporeDateTimeLocal(attendance?.signed_out_at ?? attendance?.signed_in_at ?? null)} /><p className="muted">Leave blank to use the current time. Singapore time.</p></div>
                  <div className="form-field phaseone-attendance-reason"><label htmlFor={`reason-${volunteer.id}`}>Reason</label><input id={`reason-${volunteer.id}`} name="reason" minLength={5} maxLength={500} required placeholder="Required audit reason" /></div>
                  <button className="button button-primary" type="submit">Save correction</button>
                </form>
              </article>
            ))}
            {visible.length === 0 ? <p className="empty-state">No volunteers match these filters.</p> : null}
          </div>
        </section>

        <section className="section" aria-labelledby="audit-title">
          <div className="section-header"><div><p className="eyebrow">Immutable history</p><h2 id="audit-title">Recent corrections</h2></div></div>
          <div className="table-wrap"><table className="content-table"><thead><tr><th>Changed</th><th>Volunteer</th><th>Action</th><th>Reason</th><th>Before</th><th>After</th></tr></thead><tbody>
            {auditResult.data.map((audit) => {
              const volunteer = rosterById.get(audit.roster_id);
              return <tr key={audit.id}><td>{formatSingaporeDateTime(audit.changed_at)}</td><td>{volunteer?.volunteer_name ?? audit.roster_id}</td><td>{audit.action.replaceAll("_", " ")}</td><td>{audit.reason}</td><td>In: {audit.old_signed_in_at ? formatSingaporeDateTime(audit.old_signed_in_at) : "—"}<br />Out: {audit.old_signed_out_at ? formatSingaporeDateTime(audit.old_signed_out_at) : "—"}</td><td>In: {audit.new_signed_in_at ? formatSingaporeDateTime(audit.new_signed_in_at) : "—"}<br />Out: {audit.new_signed_out_at ? formatSingaporeDateTime(audit.new_signed_out_at) : "—"}</td></tr>;
            })}
            {auditResult.data.length === 0 ? <tr><td colSpan={6}>No attendance corrections yet.</td></tr> : null}
          </tbody></table></div>
        </section>
      </main>
    </div>
  );
}
