import { createHmac, timingSafeEqual } from "node:crypto";

const accessTtlSeconds = 5 * 60;
const packageActions = ["sign-in", "sign-out"] as const;

export type PackageAction = (typeof packageActions)[number];
export type PackagePinAction = "sign_in" | "sign_out";

export type PackageActionAccessClaims = Readonly<{
  eventId: string;
  action: PackageAction;
  pinUpdatedAt: string;
  expiresAt: number;
}>;

export type PackageActionPinRecord = Readonly<{
  sign_in_pin_salt: string | null;
  sign_in_pin_hash: string | null;
  sign_in_pin_updated_at: string | null;
  sign_out_pin_salt: string | null;
  sign_out_pin_hash: string | null;
  sign_out_pin_updated_at: string | null;
}>;

export type PackageActionDestinationRecord = Readonly<{
  sign_in_url: string | null;
  sign_out_url: string | null;
}>;

export type PackageActionRedirectDecision =
  | Readonly<{ status: "allowed"; destination: string }>
  | Readonly<{ status: "expired" }>
  | Readonly<{ status: "unavailable" }>;

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function signingKey(secret: string): Buffer {
  return createHmac("sha256", secret)
    .update("phaseone-package-action-access-v1")
    .digest();
}

export function isPackageAction(value: string): value is PackageAction {
  return packageActions.includes(value as PackageAction);
}

export function packageActionAuditType(action: PackageAction): PackagePinAction {
  return action === "sign-in" ? "sign_in" : "sign_out";
}

export function packageActionLabel(action: PackageAction): string {
  return action === "sign-in" ? "Sign in" : "Sign out";
}

export function packageActionCookieName(
  eventId: string,
  action: PackageAction,
): string {
  return `phaseone_package_${packageActionAuditType(action)}_${eventId}`;
}

export function packageActionRateLimitScope(
  eventId: string,
  action: PackageAction,
  clientKey: string,
): Readonly<{ eventId: string; actionType: PackagePinAction; clientKey: string }> {
  return {
    eventId,
    actionType: packageActionAuditType(action),
    clientKey,
  };
}

export function getPackageActionPin(
  record: PackageActionPinRecord,
  action: PackageAction,
): Readonly<{ salt: string; hash: string; updatedAt: string }> | null {
  const salt =
    action === "sign-in" ? record.sign_in_pin_salt : record.sign_out_pin_salt;
  const hash =
    action === "sign-in" ? record.sign_in_pin_hash : record.sign_out_pin_hash;
  const updatedAt =
    action === "sign-in"
      ? record.sign_in_pin_updated_at
      : record.sign_out_pin_updated_at;

  if (!salt || !hash || !updatedAt) return null;
  return { salt, hash, updatedAt };
}

export function getPackageActionDestination(
  record: PackageActionDestinationRecord,
  action: PackageAction,
): string | null {
  return action === "sign-in" ? record.sign_in_url : record.sign_out_url;
}

export function isSafePackageActionDestination(value: string | null): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function createPackageActionAccessToken(
  eventId: string,
  action: PackageAction,
  pinUpdatedAt: string,
  secret: string,
  now = Date.now(),
): string {
  const claims: PackageActionAccessClaims = {
    eventId,
    action,
    pinUpdatedAt,
    expiresAt: Math.floor(now / 1000) + accessTtlSeconds,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", signingKey(secret))
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function readPackageActionAccessToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): PackageActionAccessClaims | null {
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
    ) as Partial<PackageActionAccessClaims>;
    if (
      typeof claims.eventId !== "string" ||
      typeof claims.action !== "string" ||
      !isPackageAction(claims.action) ||
      typeof claims.pinUpdatedAt !== "string" ||
      typeof claims.expiresAt !== "number" ||
      claims.expiresAt <= Math.floor(now / 1000)
    ) {
      return null;
    }
    return claims as PackageActionAccessClaims;
  } catch {
    return null;
  }
}

export function hasPackageActionAccess(
  claims: PackageActionAccessClaims | null,
  eventId: string,
  action: PackageAction,
  pinUpdatedAt: string | null,
): boolean {
  return Boolean(
    claims &&
      pinUpdatedAt &&
      claims.eventId === eventId &&
      claims.action === action &&
      claims.pinUpdatedAt === pinUpdatedAt,
  );
}

export function evaluatePackageActionRedirect(input: Readonly<{
  claims: PackageActionAccessClaims | null;
  eventId: string;
  action: PackageAction;
  pinUpdatedAt: string | null;
  destination: string | null;
}>): PackageActionRedirectDecision {
  if (
    !hasPackageActionAccess(
      input.claims,
      input.eventId,
      input.action,
      input.pinUpdatedAt,
    )
  ) {
    return { status: "expired" };
  }
  if (!isSafePackageActionDestination(input.destination)) {
    return { status: "unavailable" };
  }
  return { status: "allowed", destination: input.destination as string };
}

export const packageActionAccessMaxAge = accessTtlSeconds;
