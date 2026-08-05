import { describe, expect, it } from "vitest";

import {
  getPackageListingStatus,
  groupVolunteerPackages,
  recentlyCompletedCutoffIso,
  startOfSingaporeDayIso,
  type VolunteerPackage,
} from "./packages";

const now = new Date("2026-07-30T08:00:00.000Z");

function volunteerPackage(id: string, reportingAt: string): VolunteerPackage {
  return {
    id,
    title: id,
    slug: id,
    venue: "Test venue",
    navigation_destination: "Test venue, Singapore 123456",
    has_sign_in_pin: true,
    has_sign_out_pin: true,
    timeslots: [
      {
        id: `${id}-timeslot`,
        label: null,
        starts_at: reportingAt,
        ends_at: null,
        status: "scheduled",
        sort_order: 0,
      },
    ],
  };
}

describe("package listing dates", () => {
  it("keeps events from the current Singapore calendar day visible", () => {
    expect(startOfSingaporeDayIso(new Date("2026-07-30T02:17:00.000Z"))).toBe(
      "2026-07-29T16:00:00.000Z",
    );
  });

  it("uses the next Singapore day after local midnight", () => {
    expect(startOfSingaporeDayIso(new Date("2026-07-30T16:01:00.000Z"))).toBe(
      "2026-07-30T16:00:00.000Z",
    );
  });

  it("retains seven Singapore calendar days of completed packages", () => {
    expect(recentlyCompletedCutoffIso(now)).toBe("2026-07-22T16:00:00.000Z");
  });

  it("groups today, upcoming and recently completed packages in display order", () => {
    const groups = groupVolunteerPackages([
      volunteerPackage("older-completed", "2026-07-28T01:00:00.000Z"),
      volunteerPackage("today", "2026-07-30T01:00:00.000Z"),
      volunteerPackage("upcoming", "2026-08-01T01:00:00.000Z"),
      volunteerPackage("newer-completed", "2026-07-29T01:00:00.000Z"),
    ], now);

    expect(groups.today.map(({ id }) => id)).toEqual(["today"]);
    expect(groups.upcoming.map(({ id }) => id)).toEqual(["upcoming"]);
    expect(groups.recentlyCompleted.map(({ id }) => id)).toEqual([
      "newer-completed",
      "older-completed",
    ]);
  });

  it("describes listing visibility for CMS operators", () => {
    expect(getPackageListingStatus("2026-07-30T01:00:00.000Z", true, now)).toBe(
      "Published — visible today",
    );
    expect(getPackageListingStatus("2026-08-01T01:00:00.000Z", true, now)).toBe(
      "Published — upcoming",
    );
    expect(getPackageListingStatus("2026-07-29T01:00:00.000Z", true, now)).toBe(
      "Published — recently completed",
    );
    expect(getPackageListingStatus("2026-07-01T01:00:00.000Z", true, now)).toBe(
      "Published — past, hidden from listing",
    );
  });
});
