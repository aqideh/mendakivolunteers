import { createPinHash } from "@/lib/phaseone/event-access";
import { startOfSingaporeDayIso } from "@/lib/phaseone/packages";

export type PackagePinState = Readonly<{
  sign_in_pin_hash: string | null;
  sign_out_pin_hash: string | null;
}>;

export type PackagePinInput = Readonly<{
  signInPin: string | null;
  clearSignInPin: boolean;
  signOutPin: string | null;
  clearSignOutPin: boolean;
}>;

export type PackagePinUpdate = Readonly<Record<string, string | null>>;

export function buildPackagePinUpdate(
  input: PackagePinInput,
  now = new Date().toISOString(),
): PackagePinUpdate {
  const update: Record<string, string | null> = {};

  if (input.signInPin) {
    const pin = createPinHash(input.signInPin);
    update.sign_in_pin_salt = pin.salt;
    update.sign_in_pin_hash = pin.hash;
    update.sign_in_pin_updated_at = now;
  } else if (input.clearSignInPin) {
    update.sign_in_pin_salt = null;
    update.sign_in_pin_hash = null;
    update.sign_in_pin_updated_at = null;
  }

  if (input.signOutPin) {
    const pin = createPinHash(input.signOutPin);
    update.sign_out_pin_salt = pin.salt;
    update.sign_out_pin_hash = pin.hash;
    update.sign_out_pin_updated_at = now;
  } else if (input.clearSignOutPin) {
    update.sign_out_pin_salt = null;
    update.sign_out_pin_hash = null;
    update.sign_out_pin_updated_at = null;
  }

  return update;
}

export function packageWillHaveActionPins(
  current: PackagePinState | null,
  input: PackagePinInput,
): Readonly<{ signIn: boolean; signOut: boolean }> {
  return {
    signIn: Boolean(
      input.signInPin || (!input.clearSignInPin && current?.sign_in_pin_hash),
    ),
    signOut: Boolean(
      input.signOutPin || (!input.clearSignOutPin && current?.sign_out_pin_hash),
    ),
  };
}

export function getPackagePublishError(input: Readonly<{
  isPublished: boolean;
  reportingAt: string | null;
  venue: string | null;
  navigationDestination: string | null;
  briefingUrl: string | null;
  briefingAvailableAt: string | null;
  signInUrl: string | null;
  signOutUrl: string | null;
  hasSignInPin: boolean;
  hasSignOutPin: boolean;
}>, now = new Date()): string | null {
  if (!input.isPublished) return null;
  if (!input.reportingAt) return "Published packages require a reporting date and time.";
  if (input.reportingAt < startOfSingaporeDayIso(now)) {
    return "The reporting date has already passed. Update the reporting date before publishing this package.";
  }
  if (!input.venue || !input.navigationDestination) {
    return "Published packages require a venue and navigation destination.";
  }
  if (!input.signInUrl || !input.signOutUrl) {
    return "Published packages require both sign-in and sign-out URLs.";
  }
  if (!input.hasSignInPin || !input.hasSignOutPin) {
    return "Published packages require separate sign-in and sign-out PINs.";
  }
  if (input.briefingUrl && !input.briefingAvailableAt) {
    return "A briefing release date is required when a briefing URL is configured.";
  }
  if (!input.briefingUrl && input.briefingAvailableAt) {
    return "Remove the briefing release date or add a briefing URL.";
  }
  return null;
}
