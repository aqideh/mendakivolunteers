import { describe, expect, it } from "vitest";

import {
  adminPastEventCutoffIso,
  getAdminEventEffectiveEnd,
  isPastAdminEvent,
  splitAdminEvents,
  type AdminEventSummary,
} from "./admin-events";

const now = new Date("2026-08-21T06:00:00.000Z");

function event(
  id: string,
  timeslots: AdminEventSummary["timeslots"],
): AdminEventSummary {
  return {
    id,
    title: id,
    slug: id,
    venue: "Test venue",
    reporting_at: timeslots[0]?.starts_at ?? null,
    has_sign_in_pin: true,
    has_sign_out_pin: true,
    briefing_available_at: null,
    is_published: true,
    updated_at: "2026-08-01T00:00:00.000Z",
    timeslots,
  };
}

describe("admin event archive classification", () => {
  it("uses an exact fourteen-day cutoff", () => {
    expect(adminPastEventCutoffIso(now)).toBe("2026-08-07T06:00:00.000Z");
  });

  it("uses the final scheduled shift end for multi-shift events", () => {
    const item = event("multi-day", [
      {
        id: "one",
        label: "Day 1",
        starts_at: "2026-08-01T01:00:00.000Z",
        ends_at: "2026-08-01T04:00:00.000Z",
        status: "scheduled",
        sort_order: 0,
      },
      {
        id: "two",
        label: "Day 2",
        starts_at: "2026-08-10T01:00:00.000Z",
        ends_at: "2026-08-10T04:00:00.000Z",
        status: "scheduled",
        sort_order: 1,
      },
    ]);

    expect(getAdminEventEffectiveEnd(item)).toBe("2026-08-10T04:00:00.000Z");
    expect(isPastAdminEvent(item, now)).toBe(false);
  });

  it("archives an event only when its final scheduled shift is older than fourteen days", () => {
    const old = event("old", [
      {
        id: "old-shift",
        label: null,
        starts_at: "2026-08-06T01:00:00.000Z",
        ends_at: "2026-08-06T04:00:00.000Z",
        status: "scheduled",
        sort_order: 0,
      },
    ]);
    const boundary = event("boundary", [
      {
        id: "boundary-shift",
        label: null,
        starts_at: "2026-08-07T03:00:00.000Z",
        ends_at: "2026-08-07T06:00:00.000Z",
        status: "scheduled",
        sort_order: 0,
      },
    ]);

    expect(isPastAdminEvent(old, now)).toBe(true);
    expect(isPastAdminEvent(boundary, now)).toBe(false);
  });

  it("ignores cancelled shifts when determining the final event date", () => {
    const item = event("cancelled-later-shift", [
      {
        id: "scheduled",
        label: null,
        starts_at: "2026-08-01T01:00:00.000Z",
        ends_at: "2026-08-01T04:00:00.000Z",
        status: "scheduled",
        sort_order: 0,
      },
      {
        id: "cancelled",
        label: null,
        starts_at: "2026-08-20T01:00:00.000Z",
        ends_at: "2026-08-20T04:00:00.000Z",
        status: "cancelled",
        sort_order: 1,
      },
    ]);

    expect(isPastAdminEvent(item, now)).toBe(true);
  });

  it("keeps unscheduled events in the current operational list", () => {
    const unscheduled = event("draft", []);
    const old = event("old", [
      {
        id: "old-shift",
        label: null,
        starts_at: "2026-07-01T01:00:00.000Z",
        ends_at: null,
        status: "scheduled",
        sort_order: 0,
      },
    ]);

    const groups = splitAdminEvents([unscheduled, old], now);
    expect(groups.current.map(({ id }) => id)).toEqual(["draft"]);
    expect(groups.past.map(({ id }) => id)).toEqual(["old"]);
  });
});
