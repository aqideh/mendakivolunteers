import { describe, expect, it } from "vitest";

import {
  buildPackagePinUpdate,
  getPackagePublishError,
  packageWillHaveActionPins,
} from "./package-cms";

const now = new Date("2026-07-30T08:00:00.000Z");
type PublishInput = Parameters<typeof getPackagePublishError>[0];

function completePackage(overrides: Partial<PublishInput> = {}): PublishInput {
  return {
    isPublished: true,
    timeslots: [
      {
        startsAt: "2026-08-01T01:00:00.000Z",
        endsAt: null,
        status: "scheduled",
      },
    ],
    venue: "Test venue",
    navigationDestination: "Test venue, Singapore 123456",
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

  it("requires a venue and navigation destination for published packages", () => {
    expect(
      getPackagePublishError(
        completePackage({ navigationDestination: null }),
        now,
      ),
    ).toBe("Published packages require a venue and navigation destination.");
  });

  it("allows publishing without attendance PINs or URLs", () => {
    expect(
      getPackagePublishError(
        completePackage({
          signInUrl: null,
          signOutUrl: null,
          hasSignInPin: false,
          hasSignOutPin: false,
        }),
        now,
      ),
    ).toBeNull();
  });

  it("requires a destination URL when its attendance PIN is configured", () => {
    expect(
      getPackagePublishError(
        completePackage({ signInUrl: null, hasSignInPin: true }),
        now,
      ),
    ).toBe("Add a sign-in URL or remove the sign-in PIN before publishing.");
    expect(
      getPackagePublishError(
        completePackage({ signOutUrl: null, hasSignOutPin: true }),
        now,
      ),
    ).toBe("Add a sign-out URL or remove the sign-out PIN before publishing.");
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

  it("rejects publication when every scheduled timeslot has passed", () => {
    expect(
      getPackagePublishError(
        completePackage({
          timeslots: [
            {
              startsAt: "2026-07-28T01:00:00.000Z",
              endsAt: null,
              status: "scheduled",
            },
          ],
        }),
        now,
      ),
    ).toBe("Published packages require at least one current or future scheduled timeslot.");
  });

  it("accepts a timeslot scheduled earlier on the current Singapore day", () => {
    expect(
      getPackagePublishError(
        completePackage({
          timeslots: [
            {
              startsAt: "2026-07-29T17:00:00.000Z",
              endsAt: null,
              status: "scheduled",
            },
          ],
        }),
        now,
      ),
    ).toBeNull();
  });

  it("accepts a complete published package", () => {
    expect(getPackagePublishError(completePackage(), now)).toBeNull();
  });
});
