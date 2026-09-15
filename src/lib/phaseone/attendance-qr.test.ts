import { describe, expect, it } from "vitest";

import {
  canonicalMobile,
  createAttendanceDeviceToken,
  hashAttendanceQrToken,
  readAttendanceDeviceToken,
} from "./attendance-qr";

const secret = "test-secret-that-is-definitely-longer-than-thirty-two-characters";

describe("attendance QR security helpers", () => {
  it("hashes raw QR tokens without retaining the raw value", () => {
    const token = "example-opaque-token";
    const hash = hashAttendanceQrToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
  });

  it("round-trips a signed device identity before expiry", () => {
    const now = Date.UTC(2026, 8, 15, 9, 0, 0);
    const token = createAttendanceDeviceToken("event-1", "email:volunteer@example.test", secret, now);
    expect(readAttendanceDeviceToken(token, secret, now + 1_000)).toMatchObject({
      eventId: "event-1",
      personKey: "email:volunteer@example.test",
    });
  });

  it("rejects tampered and expired device identities", () => {
    const now = Date.UTC(2026, 8, 15, 9, 0, 0);
    const token = createAttendanceDeviceToken("event-1", "id:vol-1", secret, now);
    expect(readAttendanceDeviceToken(`${token}x`, secret, now + 1_000)).toBeNull();
    expect(readAttendanceDeviceToken(token, secret, now + (15 * 60 * 60 * 1000))).toBeNull();
  });

  it("normalizes Singapore mobile variants", () => {
    expect(canonicalMobile("+65 9123 4567")).toBe("91234567");
    expect(canonicalMobile("0065 9123 4567")).toBe("91234567");
    expect(canonicalMobile("9123-4567")).toBe("91234567");
  });
});
