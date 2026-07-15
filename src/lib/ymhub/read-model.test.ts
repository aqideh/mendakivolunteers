import { describe, expect, it } from "vitest";

import {
  formatYmHubState,
  getVerifiedHours,
  getVerifiedHoursForRecord,
  getYmHubSyncOutcome,
} from "@/lib/ymhub/read-model";

describe("YM Hub read-model presentation", () => {
  it("distinguishes an unsynchronised volunteer from a successful sync", () => {
    expect(getYmHubSyncOutcome(null)).toBe("not_synced");
    expect(
      getYmHubSyncOutcome({
        last_failed_at: null,
        last_successful_at: "2026-07-15T03:30:00Z",
      }),
    ).toBe("synced");
  });

  it("reports a failure only when it is newer than the last success", () => {
    expect(
      getYmHubSyncOutcome({
        last_failed_at: "2026-07-15T04:00:00Z",
        last_successful_at: "2026-07-15T03:30:00Z",
      }),
    ).toBe("failed");
    expect(
      getYmHubSyncOutcome({
        last_failed_at: "2026-07-15T03:00:00Z",
        last_successful_at: "2026-07-15T03:30:00Z",
      }),
    ).toBe("synced");
  });

  it("rejects invalid sync timestamps", () => {
    expect(() =>
      getYmHubSyncOutcome({
        last_failed_at: "not-a-date",
        last_successful_at: "2026-07-15T03:30:00Z",
      }),
    ).toThrow("YM Hub sync status contains an invalid timestamp");
  });

  it("totals only authoritative verified hours", () => {
    expect(
      getVerifiedHours([
        { state: "verified", verified_hours: 3 },
        { state: "pending", verified_hours: null },
        { state: "verified", verified_hours: 4.5 },
      ]),
    ).toBe(7.5);
  });

  it("rejects a verified record without hours", () => {
    expect(() =>
      getVerifiedHours([{ state: "verified", verified_hours: null }]),
    ).toThrow("Verified attendance is missing verified hours");
  });

  it("requires a verified record before formatting individual hours", () => {
    expect(
      getVerifiedHoursForRecord({ state: "verified", verified_hours: 2.5 }),
    ).toBe(2.5);
    expect(() =>
      getVerifiedHoursForRecord({ state: "pending", verified_hours: null }),
    ).toThrow("Attendance record is not verified");
  });

  it("uses explicit volunteer-facing labels", () => {
    expect(formatYmHubState("waitlisted")).toBe("Waitlisted");
    expect(formatYmHubState("pending")).toBe("Pending verification");
  });
});
