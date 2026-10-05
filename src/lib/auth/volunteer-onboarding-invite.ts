import { createHash, randomBytes, randomUUID } from "node:crypto";

export const volunteerOnboardingContextCookie =
  "keluarga_onboarding_context";

export const volunteerOnboardingContextMaxAgeSeconds = 30 * 60;

export function createSecureToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashSecureToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createRedemptionNonce() {
  return randomUUID();
}
