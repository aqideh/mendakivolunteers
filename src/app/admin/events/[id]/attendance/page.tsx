import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  addWalkInVolunteer,
  applyAttendanceChange,
} from "@/app/admin/events/[id]/attendance/actions";
import {
  QuickAttendanceButton,
  WalkInSubmitButtons,
} from "@/components/phaseone/attendance-quick-action";
import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = { title: "Roster and check-in" };
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type NonAttendanceStatus = "withdrawn" | "absent";
type AttendanceStatus = "pending" | "signed_in" | "signed_out" | NonAttendanceStatus | "anomaly";

type Timeslot = {
  id: string;
  label: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  sort_order: number;
};

function parameter(values: Record<string, string | string[] | undefined>, key: string) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function statusFor(
  signedInAt: string | null,
  signedOutAt: string | null,
  nonAttendanceStatus: string | null,
): AttendanceStatus {
  if (nonAttendanceStatus === "withdrawn" || nonAttendanceStatus === "absent") {
    return nonAttendanceStatus;
  }
  if (signedOutAt && !signedInAt) return "anomaly";
  if (signedOutAt) return "signed_out";
  if (signedInAt) return "signed_in";
  return "pending";
}

function statusLabel(status: AttendanceStatus): string {
  return {
    pending: "Not arrived",
    signed_in: "Checked in",
    signed_out: "Checked out",
    withdrawn: "Withdrawn",
    absent: "Absent",
    anomaly: "Needs review",
  }[status];
}

function auditStatusLabel(status: string | null): string {
  if (status === "withdrawn") return "Withdrawn";
  if (status === "absent") return "Absent";
  return "—";
}

function singaporeDateKey(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function singaporeDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function singaporeTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function timeslotLabel(timeslot: Timeslot): string {
  if (timeslot.label?.trim()) return timeslot.label.trim();
  const start = singaporeTime(timeslot.starts_at);
  const end = timeslot.ends_at ? singaporeTime(timeslot.ends_at) : null;
  return end ? `${start}-${end}` : start;
}

function timeslotTime(timeslot: Timeslot): string {
  const start = singaporeTime(timeslot.starts_at);
  const end = timeslot.ends_at ? singaporeTime(timeslot.ends_at) : null;
  return end ? `${start}–${end}` : start;
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

async function AttendanceAudit({
  eventId,
  rosterNames,
}: {
  eventId: string;
  rosterNames: Record<string, string>;
}) {
  const admin = getPhaseOneAdminClient();
  const auditResult = await admin
    .from("phaseone_attendance_audit")
    .select("id, roster_id, action, reason, old_signed_in_at, old_signed_out_at, new_signed_in_at, new_signed_out_at, old_non_attendance_status, new_non_attendance_status, changed_at")
    .eq("event_id", eventId)
    .order("changed_at", { ascending: false })
    .limit(25);

  if (auditResult.error || !auditResult.data) {
    throw new Error("Attendance audit history could not be loaded");
  }

  return (
    <section className="section" aria-labelledby="audit-title">
      <div className="section-header">
        <div><p className="eyebrow">Audit history</p><h2 id="audit-title">Recent attendance changes</h2></div>
      </div>
      <div className="table-wrap">
        <table className="content-table">
          <thead><tr><th>Changed</th><th>Volunteer</th><th>Action</th><th>Reason</th><th>Before</th><th>After</th></tr></thead>
          <tbody>
            {auditResult.data.map((audit) => (
              <tr key={audit.id}>
                <td>{formatSingaporeDateTime(audit.changed_at)}</td>
                <td>{rosterNames[audit.roster_id] ?? audit.roster_id}</td>
                <td>{audit.action.replaceAll("_", " ")}</td>
                <td>{audit.reason}</td>
                <td>
                  Status: {auditStatusLabel(audit.old_non_attendance_status)}<br />
                  In: {audit.old_signed_in_at ? formatSingaporeDateTime(audit.old_signed_in_at) : "—"}<br />
                  Out: {audit.old_signed_out_at ? formatSingaporeDateTime(audit.old_signed_out_at) : "—"}
                </td>
                <td>
                  Status: {auditStatusLabel(audit.new_non_attendance_status)}<br />
                  In: {audit.new_signed_in_at ? formatSingaporeDateTime(audit.new_signed_in_at) : "—"}<br />
                  Out: {audit.new_signed_out_at ? formatSingaporeDateTime(audit.new_signed_out_at) : "—"}
                </td>
              </tr>
            ))}
            {auditResult.data.length === 0 ? <tr><td colSpan={6}>No attendance changes yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function AttendancePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  await requireEventManager(`/admin/events/${id}/attendance`);
  const admin = getPhaseOneAdminClient();
  const [eventResult, timeslotsResult, rosterResult, attendanceResult] = await Promise.all([
    admin.from("phaseone_events").select("id, title, slug, venue").eq("id", id).maybeSingle(),
    admin
      .from("phaseone_event_timeslots")
      .select("id, label, starts_at, ends_at, status, sort_order")
      .eq("event_id", id)
      .order("starts_at", { ascending: true })
      .order("sort_order", { ascending: true }),
    admin
      .from("phaseone_roster")
      .select("id, timeslot_id, volunteer_key, volunteer_name, email, mobile, tshirt_size, entry_method")
      .eq("event_id", id)
      .order("volunteer_name")
      .limit(2000),
    admin
      .from("phaseone_attendance")
      .select("id, roster_id, signed_in_at, signed_out_at, non_attendance_status, non_attendance_marked_at, updated_at")
      .eq("event_id", id),
  ]);

  if (eventResult.error) throw new Error("Event could not be loaded");
  if (!eventResult.data) notFound();
  if (
    timeslotsResult.error || !timeslotsResult.data ||
    rosterResult.error || !rosterResult.data ||
    attendanceResult.error || !attendanceResult.data
  ) {
    throw new Error("Attendance operations data could not be loaded");
  }

  const timeslots = timeslotsResult.data as Timeslot[];
  const activeTimeslots = timeslots.filter((timeslot) => timeslot.status !== "cancelled");
  const parameters = await searchParams;
  const requestedTimeslot = parameter(parameters, "timeslot");
  const selectedTimeslot = activeTimeslots.find((timeslot) => timeslot.id === requestedTimeslot)
    ?? activeTimeslots[0]
    ?? timeslots[0];
  const highlightedRosterId = parameter(parameters, "highlight");

  const attendanceByRoster = new Map(attendanceResult.data.map((item) => [item.roster_id, item]));
  const rosterNames = Object.fromEntries(
    rosterResult.data.map((item) => [item.id, item.volunteer_name]),
  );
  const records = rosterResult.data
    .filter((volunteer) => !selectedTimeslot || volunteer.timeslot_id === selectedTimeslot.id)
    .map((volunteer) => {
      const attendance = attendanceByRoster.get(volunteer.id);
      return {
        volunteer,
        attendance,
        status: statusFor(
          attendance?.signed_in_at ?? null,
          attendance?.signed_out_at ?? null,
          attendance?.non_attendance_status ?? null,
        ),
      };
    });

  const query = (parameter(parameters, "q") ?? "").trim().toLowerCase();
  const requestedFilter = parameter(parameters, "status") ?? "all";
  const validFilters = new Set(["all", "pending", "signed_in", "signed_out", "withdrawn", "absent", "anomaly"]);
  const filter = validFilters.has(requestedFilter) ? requestedFilter : "all";
  const visible = records.filter(({ volunteer, status }) => {
    const matchesStatus = filter === "all" || status === filter;
    const haystack = [
      volunteer.volunteer_key,
      volunteer.volunteer_name,
      volunteer.email,
      volunteer.mobile,
      volunteer.tshirt_size,
    ].filter(Boolean).join(" ").toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });
  const counts = records.reduce<Record<AttendanceStatus, number>>(
    (totals, record) => ({ ...totals, [record.status]: totals[record.status] + 1 }),
    { pending: 0, signed_in: 0, signed_out: 0, withdrawn: 0, absent: 0, anomaly: 0 },
  );
  const activeFilterLabel = filter === "all"
    ? query ? "Search" : null
    : statusLabel(filter as AttendanceStatus);

  const successCode = parameter(parameters, "success");
  const successMessage = successCode === "attendance_recorded"
    ? "Attendance recorded."
    : successCode === "attendance_updated"
      ? "Attendance correction saved and audited."
      : successCode === "walk_in_checked_in"
        ? "Last-minute volunteer added and checked in."
        : successCode === "walk_in_added"
          ? "Last-minute volunteer added to the roster."
          : undefined;
  const errorMessage = parameter(parameters, "error");
  const event = eventResult.data;

  const dayGroups = new Map<string, Timeslot[]>();
  for (const timeslot of activeTimeslots) {
    const key = singaporeDateKey(timeslot.starts_at);
    const group = dayGroups.get(key) ?? [];
    group.push(timeslot);
    dayGroups.set(key, group);
  }

  return (
    <div className="site-shell">
      <PortalHeader status="Roster / check-in" dashboard />
      <main className="page-frame phaseone-operations-page">
        <div className="dashboard-header phaseone-operations-header">
          <div>
            <p className="eyebrow">Staff event operations</p>
            <h1>{event.title}</h1>
            <p className="muted">{event.venue ?? "Venue not set"}</p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href={`/admin/events/${id}/edit`}>Event settings / upload roster</Link>
            <a className="button button-secondary" href={`/admin/events/${id}/attendance/export`}>Export attendance</a>
          </div>
        </div>

        {successMessage ? <div className="notice notice-success" role="status">{successMessage}</div> : null}
        {errorMessage ? <div className="notice notice-error" role="alert">{errorMessage}</div> : null}

        <section className="panel phaseone-shift-picker" aria-labelledby="shift-title">
          <div className="section-header">
            <div><p className="eyebrow">Day / shift</p><h2 id="shift-title">Select deployment</h2></div>
          </div>
          <div className="phaseone-shift-days">
            {Array.from(dayGroups.entries()).map(([date, slots]) => (
              <div className="phaseone-shift-day" key={date}>
                <strong>{singaporeDateLabel(slots[0]!.starts_at)}</strong>
                <div className="actions">
                  {slots.map((timeslot) => (
                    <Link
                      className={selectedTimeslot?.id === timeslot.id ? "button button-primary" : "button button-secondary"}
                      href={`/admin/events/${id}/attendance?timeslot=${encodeURIComponent(timeslot.id)}`}
                      key={timeslot.id}
                    >
                      {timeslotLabel(timeslot)} · {timeslotTime(timeslot)}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {activeTimeslots.length === 0 ? <p className="empty-state">No active shifts are configured for this event.</p> : null}
          </div>
        </section>

        {selectedTimeslot ? (
          <>
            <section className="metric-grid phaseone-attendance-metrics" aria-label="Attendance totals">
              <article className="metric-card"><span className="metric-value">{records.length}</span><span className="metric-label">Roster</span></article>
              <article className="metric-card"><span className="metric-value">{counts.pending}</span><span className="metric-label">Not arrived</span></article>
              <article className="metric-card"><span className="metric-value">{counts.signed_in}</span><span className="metric-label">Checked in</span></article>
              <article className="metric-card"><span className="metric-value">{counts.signed_out}</span><span className="metric-label">Checked out</span></article>
              <article className="metric-card"><span className="metric-value">{counts.withdrawn}</span><span className="metric-label">Withdrawn</span></article>
              <article className="metric-card"><span className="metric-value">{counts.absent}</span><span className="metric-label">Absent</span></article>
            </section>

            <section className="section panel phaseone-admin-section" aria-labelledby="attendance-roster-title">
              <div className="section-header phaseone-roster-heading">
                <div>
                  <p className="eyebrow">{singaporeDateLabel(selectedTimeslot.starts_at)} · {timeslotLabel(selectedTimeslot)}</p>
                  <h2 id="attendance-roster-title">Volunteer roster</h2>
                </div>
                <span className="status-pill">{visible.length} shown{activeFilterLabel ? ` · ${activeFilterLabel}` : ""}</span>
              </div>

              <details className="phaseone-walk-in">
                <summary className="phaseone-walk-in-summary">
                  <span>+ Walk-in volunteer</span>
                  <span className="phaseone-walk-in-summary-hint">Add on the day</span>
                </summary>
                <div className="phaseone-walk-in-body">
                  <p className="muted">Add someone who was not on the original roster. They will be attached to this selected shift.</p>
                  <form action={addWalkInVolunteer} className="phaseone-walk-in-form">
                    <input name="eventId" type="hidden" value={id} />
                    <input name="timeslotId" type="hidden" value={selectedTimeslot.id} />
                    <div className="phaseone-walk-in-grid">
                      <div className="form-field">
                        <label htmlFor="walk-in-name">Name</label>
                        <input id="walk-in-name" name="volunteerName" maxLength={200} required autoComplete="name" />
                      </div>
                      <div className="form-field">
                        <label htmlFor="walk-in-mobile">Contact number</label>
                        <input id="walk-in-mobile" name="mobile" maxLength={50} autoComplete="tel" inputMode="tel" />
                      </div>
                      <div className="form-field">
                        <label htmlFor="walk-in-email">Email</label>
                        <input id="walk-in-email" name="email" maxLength={320} type="email" autoComplete="email" />
                      </div>
                      <div className="form-field">
                        <label htmlFor="walk-in-id">Volunteer ID</label>
                        <input id="walk-in-id" name="volunteerKey" maxLength={100} />
                        <p className="muted">Optional.</p>
                      </div>
                      <div className="form-field">
                        <label htmlFor="walk-in-shirt">T-shirt size</label>
                        <input id="walk-in-shirt" name="tshirtSize" maxLength={20} placeholder="e.g. M" />
                      </div>
                    </div>
                    <WalkInSubmitButtons />
                    <p className="muted phaseone-walk-in-note">This creates an operational event roster entry only; it does not create a portal account or official YM Hub registration.</p>
                  </form>
                </div>
              </details>

              <form className="phaseone-attendance-filters phaseone-desktop-filters" method="get">
                <input name="timeslot" type="hidden" value={selectedTimeslot.id} />
                <div className="form-field"><label htmlFor="q">Search</label><input id="q" name="q" defaultValue={query} placeholder="Name, volunteer ID or contact number" /></div>
                <div className="form-field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={filter}><option value="all">All</option><option value="pending">Not arrived</option><option value="signed_in">Checked in</option><option value="signed_out">Checked out</option><option value="withdrawn">Withdrawn</option><option value="absent">Absent</option><option value="anomaly">Needs review</option></select></div>
                <button className="button button-secondary" type="submit">Apply filters</button>
              </form>

              <details
                className="phaseone-mobile-filter"
                data-active={filter !== "all" || query ? "true" : undefined}
              >
                <summary aria-label="Filter roster" title="Filter roster">
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M4 5h16l-6.25 7.1v5.15l-3.5 1.75v-6.9L4 5Z" />
                  </svg>
                  <span className="phaseone-mobile-filter-dot" aria-hidden="true" />
                </summary>
                <div className="phaseone-mobile-filter-panel">
                  <div className="phaseone-mobile-filter-heading">
                    <strong>Filter roster</strong>
                    <span className="muted">{visible.length} shown</span>
                  </div>
                  <form className="phaseone-mobile-filter-form" method="get">
                    <input name="timeslot" type="hidden" value={selectedTimeslot.id} />
                    <div className="form-field">
                      <label htmlFor="mobile-q">Search</label>
                      <input id="mobile-q" name="q" defaultValue={query} placeholder="Name, ID or contact" />
                    </div>
                    <div className="form-field">
                      <label htmlFor="mobile-status">Status</label>
                      <select id="mobile-status" name="status" defaultValue={filter}>
                        <option value="all">All</option>
                        <option value="pending">Not arrived</option>
                        <option value="signed_in">Checked in</option>
                        <option value="signed_out">Checked out</option>
                        <option value="withdrawn">Withdrawn</option>
                        <option value="absent">Absent</option>
                        <option value="anomaly">Needs review</option>
                      </select>
                    </div>
                    <div className="phaseone-mobile-filter-actions">
                      <button className="button button-primary" type="submit">Apply</button>
                      <Link
                        className="button button-secondary"
                        href={`/admin/events/${id}/attendance?timeslot=${encodeURIComponent(selectedTimeslot.id)}`}
                      >
                        Clear
                      </Link>
                    </div>
                  </form>
                </div>
              </details>

              <div className="phaseone-attendance-list">
                {visible.map(({ volunteer, attendance, status }) => (
                  <article
                    className="phaseone-attendance-card phaseone-checkin-card"
                    data-highlighted={highlightedRosterId === volunteer.id ? "true" : undefined}
                    data-status={status}
                    id={`roster-${volunteer.id}`}
                    key={volunteer.id}
                  >
                    <div className="phaseone-attendance-summary">
                      <div>
                        <div className="phaseone-roster-meta">
                          <p className="record-kicker">{volunteer.volunteer_key ?? "No volunteer ID"}</p>
                          {volunteer.entry_method === "walk_in" ? <span className="status-pill phaseone-walk-in-badge">Walk-in</span> : null}
                        </div>
                        <h3>{volunteer.volunteer_name}</h3>
                        <p className="muted">{volunteer.mobile ?? "No contact number"} · T-shirt: {volunteer.tshirt_size ?? "—"}</p>
                      </div>
                      <span className="status-pill" data-state={status}>{statusLabel(status)}</span>
                    </div>

                    {attendance?.signed_in_at || attendance?.signed_out_at || status === "withdrawn" || status === "absent" ? (
                      <dl className="phaseone-attendance-times">
                        {attendance?.signed_in_at ? <div><dt>Check-in</dt><dd>{formatSingaporeDateTime(attendance.signed_in_at)}</dd></div> : null}
                        {attendance?.signed_out_at ? <div><dt>Check-out</dt><dd>{formatSingaporeDateTime(attendance.signed_out_at)}</dd></div> : null}
                        {(status === "withdrawn" || status === "absent") ? (
                          <div><dt>Status marked</dt><dd>{attendance?.non_attendance_marked_at ? formatSingaporeDateTime(attendance.non_attendance_marked_at) : "Not recorded"}</dd></div>
                        ) : null}
                      </dl>
                    ) : null}

                    {status === "pending" ? (
                      <div className="phaseone-pending-actions">
                        <QuickAttendanceButton
                          action="mark_sign_in"
                          eventId={id}
                          rosterId={volunteer.id}
                          timeslotId={selectedTimeslot.id}
                        />
                        <QuickAttendanceButton
                          action="mark_withdrawn"
                          eventId={id}
                          rosterId={volunteer.id}
                          timeslotId={selectedTimeslot.id}
                        />
                        <QuickAttendanceButton
                          action="mark_absent"
                          eventId={id}
                          rosterId={volunteer.id}
                          timeslotId={selectedTimeslot.id}
                        />
                      </div>
                    ) : status === "signed_in" ? (
                      <QuickAttendanceButton
                        action="mark_sign_out"
                        eventId={id}
                        rosterId={volunteer.id}
                        timeslotId={selectedTimeslot.id}
                      />
                    ) : status === "withdrawn" || status === "absent" ? (
                      <QuickAttendanceButton
                        action="clear_non_attendance"
                        eventId={id}
                        rosterId={volunteer.id}
                        timeslotId={selectedTimeslot.id}
                      />
                    ) : null}

                    {status === "anomaly" ? <p className="notice notice-error">Check-out exists without a check-in timestamp.</p> : null}

                    <details className="phaseone-attendance-edit">
                      <summary>Correct attendance</summary>
                      <form action={applyAttendanceChange} className="phaseone-attendance-correction">
                        <input name="eventId" type="hidden" value={id} />
                        <input name="rosterId" type="hidden" value={volunteer.id} />
                        <input name="timeslotId" type="hidden" value={selectedTimeslot.id} />
                        <div className="form-field">
                          <label htmlFor={`action-${volunteer.id}`}>Correction</label>
                          <select
                            id={`action-${volunteer.id}`}
                            name="action"
                            defaultValue={attendance?.non_attendance_status ? "clear_non_attendance" : attendance?.signed_in_at ? (attendance.signed_out_at ? "clear_sign_out" : "mark_sign_out") : "mark_sign_in"}
                          >
                            <option value="mark_sign_in">Set or correct check-in</option>
                            <option value="mark_sign_out">Set or correct check-out</option>
                            <option value="clear_sign_in">Clear check-in</option>
                            <option value="clear_sign_out">Clear check-out</option>
                            <option value="mark_withdrawn">Mark withdrawn</option>
                            <option value="mark_absent">Mark absent</option>
                            <option value="clear_non_attendance">Clear withdrawn/absent status</option>
                          </select>
                        </div>
                        <div className="form-field"><label htmlFor={`timestamp-${volunteer.id}`}>Timestamp</label><input id={`timestamp-${volunteer.id}`} name="timestamp" type="datetime-local" defaultValue={toSingaporeDateTimeLocal(attendance?.non_attendance_marked_at ?? attendance?.signed_out_at ?? attendance?.signed_in_at ?? null)} /><p className="muted">Leave blank to use the current time. Singapore time.</p></div>
                        <div className="form-field phaseone-attendance-reason"><label htmlFor={`reason-${volunteer.id}`}>Reason</label><input id={`reason-${volunteer.id}`} name="reason" minLength={5} maxLength={500} required placeholder="Required audit reason" /></div>
                        <button className="button button-secondary" type="submit">Save correction</button>
                      </form>
                    </details>
                  </article>
                ))}
                {visible.length === 0 ? <p className="empty-state">No volunteers match these filters.</p> : null}
              </div>
            </section>
          </>
        ) : null}

        <Suspense fallback={<section className="section"><p className="muted">Loading recent attendance changes…</p></section>}>
          <AttendanceAudit eventId={id} rosterNames={rosterNames} />
        </Suspense>
      </main>
    </div>
  );
}
