import { describe, expect, it } from "vitest";

import {
  buildPackagePinUpdate,
  getPackagePublishError,
  packageWillHaveActionPins,
} from "./package-cms";

const now = new Date("2026-07-30T08:00:00.000Z");

function completePackage(overrides: Record<string, unknown> = {}) {
  return {
    isPublished: true,
    reportingAt: "2026-08-01T01:00:00.000Z",
    briefingUrl: null,
    briefingAvailableAt: null,
    signInUrl: "https://example.com/sign-in",
    signOutUrl: "https://example.com/sign-out",
    hasSignInPin: true,
    hasSignOutPin: true,
    ...overrides,
  };
}

describe("package CMS policy", () => {
  it("updates and clears action PINs independently", () => {
    const update = buildPackagePinUpdate(
      {
        signInPin: "1234",
        clearSignInPin: false,
        signOutPin: null,
        clearSignOutPin: true,
      },
      "2026-07-30T03:30:00.000Z",
    );

    expect(update.sign_in_pin_hash).toEqual(expect.any(String));
    expect(update.sign_in_pin_salt).toEqual(expect.any(String));
    expect(update.sign_in_pin_updated_at).toBe("2026-07-30T03:30:00.000Z");
    expect(update.sign_out_pin_hash).toBeNull();
    expect(update.sign_out_pin_salt).toBeNull();
    expect(update.sign_out_pin_updated_at).toBeNull();
  });

  it("preserves unchanged action PINs when calculating publish readiness", () => {
    expect(
      packageWillHaveActionPins(
        { sign_in_pin_hash: "in", sign_out_pin_hash: "out" },
        {
          signInPin: null,
          clearSignInPin: false,
          signOutPin: null,
          clearSignOutPin: false,
        },
      ),
    ).toEqual({ signIn: true, signOut: true });
  });

  it("requires both action PINs and attendance URLs for published packages", () => {
    expect(
      getPackagePublishError(
        completePackage({ hasSignOutPin: false }),
        now,
      ),
    ).toBe("Published packages require separate sign-in and sign-out PINs.");
  });

  it("requires briefing URL and release time to be configured together", () => {
    expect(
      getPackagePublishError(
        completePackage({
          briefingUrl: "https://example.com/briefing",
          briefingAvailableAt: null,
        }),
        now,
      ),
    ).toBe("A briefing release date is required when a briefing URL is configured.");
  });

  it("rejects publication when the Singapore reporting date has passed", () => {
    expect(
      getPackagePublishError(
        completePackage({ reportingAt: "2026-07-28T01:00:00.000Z" }),
        now,
      ),
    ).toBe(
      "The reporting date has already passed. Update the reporting date before publishing this package.",
    );
  });

  it("accepts a package scheduled earlier on the current Singapore day", () => {
    expect(
      getPackagePublishError(
        completePackage({ reportingAt: "2026-07-29T17:00:00.000Z" }),
        now,
      ),
    ).toBeNull();
  });

  it("accepts a complete published package", () => {
    expect(getPackagePublishError(completePackage(), now)).toBeNull();
  });
});
