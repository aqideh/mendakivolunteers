export type ReconciliationSeverity = "high" | "medium" | "low";
export type ReconciliationKind =
  | "missing_attendance"
  | "open_session"
  | "checkout_without_checkin"
  | "checkout_before_checkin"
  | "duplicate_shift_identity"
  | "outside_scheduled_window";

export type ReconciliationException = {
  kind: ReconciliationKind;
  severity: ReconciliationSeverity;
  title: string;
  detail: string;
};

export type AttendanceExceptionInput = {
  nowMs: number;
  shiftStartsAt: string;
  shiftEndsAt: string | null;
  signedInAt: string | null;
  signedOutAt: string | null;
  nonAttendanceStatus: string | null;
  duplicateShiftIdentity?: boolean;
  sessionCheckedInAt?: string | null;
  sessionCheckedOutAt?: string | null;
  scheduledWindowStartsAt?: string | null;
  scheduledWindowEndsAt?: string | null;
};

const MINUTE = 60_000;
const MISSING_ATTENDANCE_GRACE_MS = 30 * MINUTE;
const OPEN_SESSION_GRACE_MS = 30 * MINUTE;
const SCHEDULE_VARIANCE_MS = 90 * MINUTE;

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function deriveAttendanceExceptions(input: AttendanceExceptionInput): ReconciliationException[] {
  const issues: ReconciliationException[] = [];
  const shiftStart = time(input.shiftStartsAt);
  const shiftEnd = time(input.shiftEndsAt);
  const signedIn = time(input.signedInAt);
  const signedOut = time(input.signedOutAt);
  const sessionIn = time(input.sessionCheckedInAt) ?? signedIn;
  const sessionOut = time(input.sessionCheckedOutAt) ?? signedOut;
  const windowStart = time(input.scheduledWindowStartsAt) ?? shiftStart;
  const windowEnd = time(input.scheduledWindowEndsAt) ?? shiftEnd;
  const isNonAttendance = input.nonAttendanceStatus === "absent" || input.nonAttendanceStatus === "withdrawn";

  if (input.duplicateShiftIdentity) {
    issues.push({
      kind: "duplicate_shift_identity",
      severity: "high",
      title: "Duplicate roster identity",
      detail: "The same event-day volunteer identity appears more than once in this shift.",
    });
  }

  if (signedOut !== null && signedIn === null) {
    issues.push({
      kind: "checkout_without_checkin",
      severity: "high",
      title: "Check-out without check-in",
      detail: "A check-out exists but no check-in is recorded for this roster assignment.",
    });
  } else if (signedIn !== null && signedOut !== null && signedOut < signedIn) {
    issues.push({
      kind: "checkout_before_checkin",
      severity: "high",
      title: "Check-out before check-in",
      detail: "The recorded check-out time is earlier than the check-in time.",
    });
  }

  if (!isNonAttendance && signedIn === null && signedOut === null && shiftEnd !== null && input.nowMs > shiftEnd + MISSING_ATTENDANCE_GRACE_MS) {
    issues.push({
      kind: "missing_attendance",
      severity: "medium",
      title: "No attendance recorded",
      detail: "This shift ended more than 30 minutes ago and the volunteer has no attendance or non-attendance status.",
    });
  }

  if (!isNonAttendance && sessionIn !== null && sessionOut === null && windowEnd !== null && input.nowMs > windowEnd + OPEN_SESSION_GRACE_MS) {
    issues.push({
      kind: "open_session",
      severity: "high",
      title: "Still checked in after scheduled end",
      detail: "The volunteer remains checked in more than 30 minutes after their last scheduled shift ended.",
    });
  }

  if (sessionIn !== null && windowStart !== null && sessionIn < windowStart - SCHEDULE_VARIANCE_MS) {
    issues.push({
      kind: "outside_scheduled_window",
      severity: "low",
      title: "Check-in outside scheduled window",
      detail: "The event-day check-in is more than 90 minutes before the first scheduled shift.",
    });
  }

  if (sessionOut !== null && windowEnd !== null && sessionOut > windowEnd + SCHEDULE_VARIANCE_MS) {
    issues.push({
      kind: "outside_scheduled_window",
      severity: "low",
      title: "Check-out outside scheduled window",
      detail: "The event-day check-out is more than 90 minutes after the last scheduled shift. Confirm whether the volunteer stayed longer.",
    });
  }

  return issues;
}
