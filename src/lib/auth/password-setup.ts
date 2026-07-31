import { createHash, randomBytes } from "node:crypto";

const passwordSetupTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export const PASSWORD_SETUP_TOKEN_TTL_MS = 60 * 60 * 1000;

export function generatePasswordSetupToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isPasswordSetupToken(value: unknown): value is string {
  return typeof value === "string" && passwordSetupTokenPattern.test(value);
}

export function hashPasswordSetupToken(token: string): string {
  if (!isPasswordSetupToken(token)) {
    throw new Error("Password setup token is invalid");
  }

  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildPasswordSetupUrl(appUrl: string, token: string): string {
  if (!isPasswordSetupToken(token)) {
    throw new Error("Password setup token is invalid");
  }

  const url = new URL("/set-password", appUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}
