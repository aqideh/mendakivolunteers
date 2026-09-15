import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getPublicConfig } from "@/lib/env";
import { getPhaseOneAdminClient, getPhaseOneServerSecret } from "@/lib/phaseone/admin";

export type AttendanceQrAction = "check_in" | "check_out";

type DeviceClaims = Readonly<{
  eventId: string;
  personKey: string;
  expiresAt: number;
}>;

const QR_TTL_MS = 5 * 60 * 1000;
const DEVICE_TTL_SECONDS = 14 * 60 * 60;

export const attendanceDeviceCookieName = "keluarga_attendance_identity";
export const attendanceDeviceMaxAge = DEVICE_TTL_SECONDS;
export const attendanceQrRefreshMs = QR_TTL_MS;

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function deviceSigningKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("keluarga-attendance-device-v1").digest();
}

export function hashAttendanceQrToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function canonicalMobile(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/^0065\d{8}$/.test(digits)) return digits.slice(4);
  if (/^65\d{8}$/.test(digits)) return digits.slice(2);
  return digits;
}

export function createAttendanceDeviceToken(
  eventId: string,
  personKey: string,
  secret = getPhaseOneServerSecret(),
  now = Date.now(),
): string {
  const claims: DeviceClaims = {
    eventId,
    personKey,
    expiresAt: Math.floor(now / 1000) + DEVICE_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", deviceSigningKey(secret)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readAttendanceDeviceToken(
  token: string | undefined,
  secret = getPhaseOneServerSecret(),
  now = Date.now(),
): DeviceClaims | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = createHmac("sha256", deviceSigningKey(secret)).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (!safeEqual(expected, supplied)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<DeviceClaims>;
    if (
      typeof claims.eventId !== "string" ||
      typeof claims.personKey !== "string" ||
      typeof claims.expiresAt !== "number" ||
      claims.expiresAt <= Math.floor(now / 1000)
    ) return null;
    return claims as DeviceClaims;
  } catch {
    return null;
  }
}

export async function createAttendanceQrSession(input: Readonly<{
  eventId: string;
  timeslotId: string;
  action: AttendanceQrAction;
  createdBy: string;
}>) {
  const admin = getPhaseOneAdminClient();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashAttendanceQrToken(token);
  const expiresAt = new Date(Date.now() + QR_TTL_MS).toISOString();

  const { error: revokeError } = await admin
    .from("phaseone_attendance_qr_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("event_id", input.eventId)
    .eq("timeslot_id", input.timeslotId)
    .eq("action", input.action)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());

  if (revokeError) throw new Error("Previous attendance QR could not be retired");

  const { error } = await admin.from("phaseone_attendance_qr_sessions").insert({
    event_id: input.eventId,
    timeslot_id: input.timeslotId,
    action: input.action,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_by: input.createdBy,
  });
  if (error) throw new Error("Attendance QR could not be created");

  const { appUrl } = getPublicConfig();
  const url = new URL("/attendance/scan", appUrl);
  url.searchParams.set("t", token);
  return { url: url.toString(), expiresAt };
}

export async function resolveAttendanceQrToken(token: string) {
  if (!token || token.length > 200) return null;
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin
    .from("phaseone_attendance_qr_sessions")
    .select("id, event_id, timeslot_id, action, expires_at, revoked_at")
    .eq("token_hash", hashAttendanceQrToken(token))
    .maybeSingle();

  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data as {
    id: string;
    event_id: string;
    timeslot_id: string;
    action: AttendanceQrAction;
    expires_at: string;
    revoked_at: string | null;
  };
}
