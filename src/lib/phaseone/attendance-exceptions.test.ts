import { describe, expect, it } from "vitest";

import { deriveAttendanceExceptions } from "@/lib/phaseone/attendance-exceptions";

const now = new Date("2026-09-15T10:00:00+08:00").getTime();

function base() {
  return {
    nowMs: now,
    shiftStartsAt: "2026-09-15T08:00:00+08:00",
    shiftEndsAt: "2026-09-15T09:00:00+08:00",
    signedInAt: null,
    signedOutAt: null,
    nonAttendanceStatus: null,
    sessionCheckedInAt: null,
    sessionCheckedOutAt: null,
    scheduledWindowStartsAt: "2026-09-15T08:00:00+08:00",
    scheduledWindowEndsAt: "2026-09-15T09:00:00+08:00",
  };
}

describe("deriveAttendanceExceptions", () => {
  it("flags missing attendance after a completed shift", () => {
    const issues = deriveAttendanceExceptions(base());
    expect(issues.some((issue) => issue.kind === "missing_attendance")).toBe(true);
  });

  it("does not flag missing attendance when absent", () => {
    const issues = deriveAttendanceExceptions({ ...base(), nonAttendanceStatus: "absent" });
    expect(issues.some((issue) => issue.kind === "missing_attendance")).toBe(false);
  });

  it("flags an overdue open session", () => {
    const issues = deriveAttendanceExceptions({
      ...base(),
      signedInAt: "2026-09-15T08:05:00+08:00",
      sessionCheckedInAt: "2026-09-15T08:05:00+08:00",
    });
    expect(issues.some((issue) => issue.kind === "open_session")).toBe(true);
  });

  it("flags a check-out without a check-in", () => {
    const issues = deriveAttendanceExceptions({ ...base(), signedOutAt: "2026-09-15T09:00:00+08:00" });
    expect(issues.some((issue) => issue.kind === "checkout_without_checkin")).toBe(true);
  });

  it("flags duplicate identities", () => {
    const issues = deriveAttendanceExceptions({ ...base(), duplicateShiftIdentity: true });
    expect(issues.some((issue) => issue.kind === "duplicate_shift_identity")).toBe(true);
  });

  it("flags a late event-day check-out outside the scheduled window", () => {
    const issues = deriveAttendanceExceptions({
      ...base(),
      signedInAt: "2026-09-15T08:00:00+08:00",
      signedOutAt: "2026-09-15T11:00:00+08:00",
      sessionCheckedInAt: "2026-09-15T08:00:00+08:00",
      sessionCheckedOutAt: "2026-09-15T11:00:00+08:00",
    });
    expect(issues.some((issue) => issue.kind === "outside_scheduled_window")).toBe(true);
  });
});
