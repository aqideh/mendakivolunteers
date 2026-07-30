import { describe, expect, it } from "vitest";

import {
  createPackageActionAccessToken,
  evaluatePackageActionRedirect,
  getPackageActionDestination,
  getPackageActionPin,
  hasPackageActionAccess,
  packageActionCookieName,
  packageActionRateLimitScope,
  readPackageActionAccessToken,
} from "./package-action-access";

const secret = "a-secure-package-action-secret-that-is-long-enough";
const updatedAt = "2026-07-30T02:00:00.000Z";
const now = Date.parse("2026-07-30T02:01:00.000Z");

describe("package action access", () => {
  it("keeps sign-in and sign-out cookies and claims independent", () => {
    const token = createPackageActionAccessToken(
      "event-1",
      "sign-in",
      updatedAt,
      secret,
      now,
    );
    const claims = readPackageActionAccessToken(token, secret, now);

    expect(packageActionCookieName("event-1", "sign-in")).not.toBe(
      packageActionCookieName("event-1", "sign-out"),
    );
    expect(hasPackageActionAccess(claims, "event-1", "sign-in", updatedAt)).toBe(true);
    expect(hasPackageActionAccess(claims, "event-1", "sign-out", updatedAt)).toBe(false);
  });

  it("invalidates access after the matching action PIN rotates", () => {
    const token = createPackageActionAccessToken(
      "event-1",
      "sign-out",
      updatedAt,
      secret,
      now,
    );
    const claims = readPackageActionAccessToken(token, secret, now);

    expect(
      hasPackageActionAccess(
        claims,
        "event-1",
        "sign-out",
        "2026-07-30T03:00:00.000Z",
      ),
    ).toBe(false);
    expect(hasPackageActionAccess(claims, "event-1", "sign-in", updatedAt)).toBe(false);
  });

  it("rejects expired and tampered tokens", () => {
    const token = createPackageActionAccessToken(
      "event-1",
      "sign-in",
      updatedAt,
      secret,
      now,
    );

    expect(readPackageActionAccessToken(token, secret, now + 301_000)).toBeNull();
    expect(readPackageActionAccessToken(`${token}x`, secret, now)).toBeNull();
  });

  it("selects only the requested action PIN and destination", () => {
    const record = {
      sign_in_pin_salt: "in-salt",
      sign_in_pin_hash: "in-hash",
      sign_in_pin_updated_at: updatedAt,
      sign_out_pin_salt: "out-salt",
      sign_out_pin_hash: "out-hash",
      sign_out_pin_updated_at: "2026-07-30T02:30:00.000Z",
      sign_in_url: "https://example.com/sign-in",
      sign_out_url: "https://example.com/sign-out",
    };

    expect(getPackageActionPin(record, "sign-in")).toEqual({
      salt: "in-salt",
      hash: "in-hash",
      updatedAt,
    });
    expect(getPackageActionPin(record, "sign-out")).toEqual({
      salt: "out-salt",
      hash: "out-hash",
      updatedAt: "2026-07-30T02:30:00.000Z",
    });
    expect(getPackageActionDestination(record, "sign-in")).toBe(
      "https://example.com/sign-in",
    );
    expect(getPackageActionDestination(record, "sign-out")).toBe(
      "https://example.com/sign-out",
    );
  });

  it("scopes failed-attempt limits independently by action", () => {
    expect(packageActionRateLimitScope("event-1", "sign-in", "client-1")).toEqual({
      eventId: "event-1",
      actionType: "sign_in",
      clientKey: "client-1",
    });
    expect(packageActionRateLimitScope("event-1", "sign-out", "client-1")).toEqual({
      eventId: "event-1",
      actionType: "sign_out",
      clientKey: "client-1",
    });
  });

  it("allows only the matching unlocked action with a safe destination", () => {
    const token = createPackageActionAccessToken(
      "event-1",
      "sign-in",
      updatedAt,
      secret,
      now,
    );
    const claims = readPackageActionAccessToken(token, secret, now);

    expect(
      evaluatePackageActionRedirect({
        claims,
        eventId: "event-1",
        action: "sign-in",
        pinUpdatedAt: updatedAt,
        destination: "https://example.com/sign-in",
      }),
    ).toEqual({ status: "allowed", destination: "https://example.com/sign-in" });
    expect(
      evaluatePackageActionRedirect({
        claims,
        eventId: "event-1",
        action: "sign-out",
        pinUpdatedAt: updatedAt,
        destination: "https://example.com/sign-out",
      }),
    ).toEqual({ status: "expired" });
    expect(
      evaluatePackageActionRedirect({
        claims,
        eventId: "event-1",
        action: "sign-in",
        pinUpdatedAt: updatedAt,
        destination: "http://example.com/sign-in",
      }),
    ).toEqual({ status: "unavailable" });
  });
});
