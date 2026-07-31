import { describe, expect, it } from "vitest";

import { evaluateBriefingAccess } from "./package-briefing";

const now = new Date("2026-07-30T02:25:00.000Z");

describe("evaluateBriefingAccess", () => {
  it("blocks unpublished packages", () => {
    expect(
      evaluateBriefingAccess({
        isPublished: false,
        briefingUrl: "https://example.com/briefing",
        briefingAvailableAt: "2026-07-30T02:00:00.000Z",
        now,
      }),
    ).toEqual({ available: false, reason: "unpublished" });
  });

  it("blocks packages without a briefing URL or release time", () => {
    expect(
      evaluateBriefingAccess({
        isPublished: true,
        briefingUrl: null,
        briefingAvailableAt: "2026-07-30T02:00:00.000Z",
        now,
      }),
    ).toEqual({ available: false, reason: "not_configured" });
  });

  it("blocks access before the configured release instant", () => {
    expect(
      evaluateBriefingAccess({
        isPublished: true,
        briefingUrl: "https://example.com/briefing",
        briefingAvailableAt: "2026-07-30T02:30:00.000Z",
        now,
      }),
    ).toEqual({ available: false, reason: "not_started" });
  });

  it("allows access exactly at the configured release instant", () => {
    expect(
      evaluateBriefingAccess({
        isPublished: true,
        briefingUrl: "https://example.com/briefing",
        briefingAvailableAt: "2026-07-30T02:25:00.000Z",
        now,
      }),
    ).toEqual({ available: true, destination: "https://example.com/briefing" });
  });

  it("rejects non-HTTPS destinations", () => {
    expect(
      evaluateBriefingAccess({
        isPublished: true,
        briefingUrl: "http://example.com/briefing",
        briefingAvailableAt: "2026-07-30T02:00:00.000Z",
        now,
      }),
    ).toEqual({ available: false, reason: "invalid_destination" });
  });
});
