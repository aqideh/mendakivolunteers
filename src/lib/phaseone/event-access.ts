import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const accessTtlSeconds = 30 * 60;
const pinKeyLength = 32;

export type EventAccessClaims = Readonly<{
  eventId: string;
  expiresAt: number;
  pinUpdatedAt: string;
}>;

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function signingKey(secret: string): Buffer {
  return createHmac("sha256", secret)
    .update("phaseone-event-access-v1")
    .digest();
}

export function createPinHash(pin: string): Readonly<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString("hex");
  return {
    salt,
    hash: scryptSync(pin, salt, pinKeyLength).toString("hex"),
  };
}

export function verifyPin(pin: string, salt: string, expectedHash: string): boolean {
  const actual = scryptSync(pin, salt, pinKeyLength);
  const expected = Buffer.from(expectedHash, "hex");
  return safeEqual(actual, expected);
}

export function createEventAccessToken(
  eventId: string,
  pinUpdatedAt: string,
  secret: string,
  now = Date.now(),
): string {
  const claims: EventAccessClaims = {
    eventId,
    pinUpdatedAt,
    expiresAt: Math.floor(now / 1000) + accessTtlSeconds,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", signingKey(secret))
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function readEventAccessToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): EventAccessClaims | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expectedSignature = createHmac("sha256", signingKey(secret))
    .update(payload)
    .digest();
  const providedSignature = Buffer.from(signature, "base64url");
  if (!safeEqual(expectedSignature, providedSignature)) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<EventAccessClaims>;
    if (
      typeof claims.eventId !== "string" ||
      typeof claims.pinUpdatedAt !== "string" ||
      typeof claims.expiresAt !== "number" ||
      claims.expiresAt <= Math.floor(now / 1000)
    ) {
      return null;
    }
    return claims as EventAccessClaims;
  } catch {
    return null;
  }
}

export function eventAccessCookieName(eventId: string): string {
  return `phaseone_event_${eventId}`;
}

export function createClientKey(
  forwardedFor: string | null,
  userAgent: string | null,
  secret: string,
): string {
  const network = forwardedFor?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", signingKey(secret))
    .update(`${network}\n${userAgent ?? "unknown"}`)
    .digest("hex");
}

export const eventAccessMaxAge = accessTtlSeconds;
