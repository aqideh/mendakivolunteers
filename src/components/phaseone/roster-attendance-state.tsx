"use client";

import Link from "next/link";

import {
  applyAttendanceChange,
} from "@/app/admin/events/[id]/attendance/actions";
import {
  ExtendAttendanceButton,
  QuickAttendanceButton,
  WithdrawalButton,
  type WithdrawalShiftPreview,
} from "@/components/phaseone/attendance-quick-action";
import { useRosterRow, useRosterShiftState } from "@/components/phaseone/roster-shift-state";
import {
  attendanceStatusLabel,
  linkedShiftFor,
} from "@/lib/phaseone/roster-row";
import {
  formatSingaporeDateTime,
  toSingaporeDateTimeLocal,
} from "@/lib/content/dates";

type NextTimeslot = {
  id: string;
  label: string;
} | null;

function compactSingaporeTime(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function RosterShiftHandover({
  nextTimeslot,
  href,
}: Readonly<{
  nextTimeslot: { id: string; label: string };
  href: string;
}>) {
  const { rows } = useRosterShiftState();
  const continuing = rows.filter(
    (row) => row.status === "signed_in" && linkedShiftFor(row, nextTimeslot.id),
  );
  const extended = continuing.filter(
    (row) =>
      linkedShiftFor(row, nextTimeslot.id)?.continuationType ===
      "extended_on_site",
  );
  const awaiting = rows.filter(
    (row) => row.status === "signed_in" && !linkedShiftFor(row, nextTimeslot.id),
  );

  return (
    <details className="km-roster-handover">
      <summary>
        Shift handover · {continuing.length} continuing · {awaiting.length} awaiting
        decision ▾
      </summary>
      <div>
        <p>
          {extended.length} extended on site. Volunteers already registered for the
          next shift continue automatically. Open Shift options on a volunteer to
          extend their attendance. Their final check-out closes the whole event-day
          session.
        </p>
        <Link className="text-link" href={href}>
          Open {nextTimeslot.label} roster
        </Link>
      </div>
    </details>
  );
}

export function RosterAttendanceMeta({
  rosterId,
  nextTimeslot,
}: Readonly<{
  rosterId: string;
  nextTimeslot: NextTimeslot;
}>) {
  const row = useRosterRow(rosterId);
  const linkedNextShift = linkedShiftFor(row, nextTimeslot?.id);

  return (
    <>
      {row.continuationType === "scheduled" ? (
        <span className="status-pill phaseone-continuation-badge">
          Continuing from earlier shift
        </span>
      ) : null}
      {row.continuationType === "extended_on_site" ? (
        <span className="status-pill phaseone-continuation-badge">
          Extended from earlier shift
        </span>
      ) : null}
      {linkedNextShift && row.status === "signed_in" && nextTimeslot ? (
        <span className="status-pill phaseone-continuation-badge">
          Also {nextTimeslot.label}
        </span>
      ) : null}
    </>
  );
}

export function RosterAttendanceStatusBadge({
  rosterId,
}: Readonly<{ rosterId: string }>) {
  const row = useRosterRow(rosterId);
  return (
    <span className="status-pill" data-state={row.status}>
      {attendanceStatusLabel(row.status)}
    </span>
  );
}

export function RosterAttendanceOperations({
  eventId,
  rosterId,
  timeslotId,
  volunteerName,
  withdrawalShifts,
  nextTimeslot,
}: Readonly<{
  eventId: string;
  rosterId: string;
  timeslotId: string;
  volunteerName: string;
  withdrawalShifts: WithdrawalShiftPreview[];
  nextTimeslot: NextTimeslot;
}>) {
  const row = useRosterRow(rosterId);
  const linkedNextShift = linkedShiftFor(row, nextTimeslot?.id);

  const compactIn = compactSingaporeTime(row.signedInAt);
  const compactOut = compactSingaporeTime(row.signedOutAt);

  return (
    <>
      {compactIn || compactOut ? (
        <p className="km-roster-mobile-time" aria-label="Attendance time">
          {compactIn ? `In ${compactIn}` : ""}
          {compactIn && compactOut ? " · " : ""}
          {compactOut ? `Out ${compactOut}` : ""}
        </p>
      ) : null}

      {row.signedInAt ||
      row.signedOutAt ||
      row.status === "withdrawn" ||
      row.status === "absent" ? (
        <dl className="phaseone-attendance-times">
          {row.signedInAt ? (
            <div>
              <dt>{row.usesInheritedSession ? "On site since" : "Check-in"}</dt>
              <dd>{formatSingaporeDateTime(row.signedInAt)}</dd>
            </div>
          ) : null}
          {row.signedOutAt ? (
            <div>
              <dt>Check-out</dt>
              <dd>{formatSingaporeDateTime(row.signedOutAt)}</dd>
            </div>
          ) : null}
          {row.status === "withdrawn" || row.status === "absent" ? (
            <div>
              <dt>Status marked</dt>
              <dd>
                {row.nonAttendanceMarkedAt
                  ? formatSingaporeDateTime(row.nonAttendanceMarkedAt)
                  : "Not recorded"}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {row.status === "pending" ? (
        <div className="phaseone-pending-actions">
          <QuickAttendanceButton
            action="mark_sign_in"
            eventId={eventId}
            rosterId={rosterId}
            timeslotId={timeslotId}
          />
          <details className="km-roster-secondary-actions">
            <summary>Other status ▾</summary>
            <div>
              <WithdrawalButton
                eventId={eventId}
                rosterId={rosterId}
                shifts={withdrawalShifts}
                timeslotId={timeslotId}
                volunteerName={volunteerName}
              />
              <QuickAttendanceButton
                action="mark_absent"
                eventId={eventId}
                rosterId={rosterId}
                timeslotId={timeslotId}
              />
            </div>
          </details>
        </div>
      ) : row.status === "signed_in" ? (
        <div className="phaseone-continuous-actions">
          <QuickAttendanceButton
            action="mark_sign_out"
            eventId={eventId}
            rosterId={rosterId}
            timeslotId={timeslotId}
          />
          {nextTimeslot && !linkedNextShift ? (
            <details className="km-roster-secondary-actions">
              <summary>Shift options ▾</summary>
              <div>
                <ExtendAttendanceButton
                  currentTimeslotId={timeslotId}
                  eventId={eventId}
                  rosterId={rosterId}
                  targetLabel={nextTimeslot.label}
                  targetTimeslotId={nextTimeslot.id}
                />
              </div>
            </details>
          ) : null}
        </div>
      ) : row.status === "withdrawn" || row.status === "absent" ? (
        <QuickAttendanceButton
          action="clear_non_attendance"
          eventId={eventId}
          rosterId={rosterId}
          timeslotId={timeslotId}
        />
      ) : null}

      {nextTimeslot && row.status === "signed_in" && !linkedNextShift ? (
        <p className="km-roster-attention-note">
          Next shift decision pending · use Shift options to extend if they are staying.
        </p>
      ) : null}
      {row.status === "anomaly" ? (
        <p className="notice notice-error">
          Check-out exists without a check-in timestamp.
        </p>
      ) : null}
    </>
  );
}

export function RosterAttendanceCorrection({
  eventId,
  rosterId,
  timeslotId,
  detailsName,
}: Readonly<{
  eventId: string;
  rosterId: string;
  timeslotId: string;
  detailsName: string;
}>) {
  const row = useRosterRow(rosterId);

  if (row.usesInheritedSession) {
    return (
      <p className="muted phaseone-inherited-note">
        Attendance corrections belong to the shift where this volunteer originally
        checked in.
      </p>
    );
  }

  const defaultAction = row.directNonAttendanceStatus
    ? "clear_non_attendance"
    : row.directSignedInAt
      ? row.directSignedOutAt
        ? "clear_sign_out"
        : "mark_sign_out"
      : "mark_sign_in";

  return (
    <details
      className="phaseone-attendance-edit phaseone-attendance-correct"
      name={detailsName}
    >
      <summary>Correct attendance</summary>
      <form action={applyAttendanceChange} className="phaseone-attendance-correction">
        <input name="eventId" type="hidden" value={eventId} />
        <input name="rosterId" type="hidden" value={rosterId} />
        <input name="timeslotId" type="hidden" value={timeslotId} />
        <div className="form-field">
          <label htmlFor={`action-${rosterId}`}>Correction</label>
          <select
            id={`action-${rosterId}`}
            name="action"
            key={defaultAction}
            defaultValue={defaultAction}
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
        <div className="form-field">
          <label htmlFor={`timestamp-${rosterId}`}>Timestamp</label>
          <input
            id={`timestamp-${rosterId}`}
            name="timestamp"
            type="datetime-local"
            key={
              row.directNonAttendanceMarkedAt ??
              row.directSignedOutAt ??
              row.directSignedInAt ??
              "empty"
            }
            defaultValue={toSingaporeDateTimeLocal(
              row.directNonAttendanceMarkedAt ??
                row.directSignedOutAt ??
                row.directSignedInAt ??
                null,
            )}
          />
          <p className="muted">
            Leave blank to use the current time. Singapore time.
          </p>
        </div>
        <div className="form-field phaseone-attendance-reason">
          <label htmlFor={`reason-${rosterId}`}>Reason</label>
          <input
            id={`reason-${rosterId}`}
            name="reason"
            minLength={5}
            maxLength={500}
            required
            placeholder="Required audit reason"
          />
        </div>
        <button className="button button-secondary" type="submit">
          Save correction
        </button>
      </form>
    </details>
  );
}
