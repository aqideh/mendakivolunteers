import type { Metadata } from "next";
import { cookies } from "next/headers";

import { redeemVolunteerOnboardingInvite } from "@/app/onboarding/invite/actions";
import { BrandLockup } from "@/components/brand-lockup";
import {
  hashSecureToken,
  volunteerOnboardingContextCookie,
} from "@/lib/auth/volunteer-onboarding-invite";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = {
  title: "Accept volunteer invitation",
};
export const dynamic = "force-dynamic";

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function one(
  values: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function stateMessage(state: string | undefined) {
  switch (state) {
    case "expired":
      return "This onboarding invitation has expired. Ask the Volunteer Management team to send a new invitation.";
    case "used":
      return "This onboarding invitation has already been used.";
    case "revoked":
      return "This onboarding invitation is no longer active. Ask the Volunteer Management team if you still need access.";
    case "busy":
      return "This onboarding invitation is already being processed. If you did not just submit it, try opening the original invitation again shortly.";
    case "unavailable":
      return "Keluarga could not open this onboarding invitation. Please try the original email again.";
    case "invalid":
      return "This onboarding invitation is invalid.";
    default:
      return null;
  }
}

function errorMessage(error: string | undefined) {
  switch (error) {
    case "verify":
      return "We could not verify those details. Check the mobile number and try again.";
    case "locked":
      return "There have been too many unsuccessful verification attempts. Try again in 15 minutes.";
    case "expired_context":
      return "This verification session has expired. Open the original invitation email again.";
    case "expired":
      return "This onboarding invitation has expired. Ask the Volunteer Management team to send a new invitation.";
    case "used":
      return "This onboarding invitation has already been used.";
    case "revoked":
      return "This onboarding invitation is no longer active.";
    case "busy":
      return "This onboarding invitation is already being processed. Try again shortly.";
    case "no_mobile":
      return "We cannot verify this invitation online because no usable mobile number is recorded for this volunteer. Please contact the Volunteer Management team.";
    case "unavailable":
      return "Keluarga could not complete onboarding right now. No volunteer record was reassigned. Please try the original invitation again.";
    default:
      return null;
  }
}

export default async function VolunteerOnboardingInvitePage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const state = one(params, "state");
  const error = one(params, "error");
  const stateCopy = stateMessage(state);
  const errorCopy = errorMessage(error);

  let invitation:
    | {
        volunteerCode: string;
        displayName: string;
        expiresAt: string;
      }
    | null = null;

  if (!stateCopy) {
    const cookieStore = await cookies();
    const contextSecret = cookieStore.get(
      volunteerOnboardingContextCookie,
    )?.value;

    if (contextSecret) {
      const admin = getPhaseOneAdminClient();
      const contextResult = await admin
        .schema("core")
        .from("volunteer_onboarding_redemption_contexts")
        .select("invite_id,expires_at,consumed_at")
        .eq("context_hash", hashSecureToken(contextSecret))
        .maybeSingle();

      if (
        !contextResult.error &&
        contextResult.data &&
        !contextResult.data.consumed_at &&
        new Date(contextResult.data.expires_at).getTime() > Date.now()
      ) {
        const inviteResult = await admin
          .schema("core")
          .from("volunteer_onboarding_invites")
          .select("volunteer_id,status,expires_at,revoked_at")
          .eq("id", contextResult.data.invite_id)
          .maybeSingle();

        if (
          !inviteResult.error &&
          inviteResult.data &&
          ["pending", "sent"].includes(inviteResult.data.status) &&
          !inviteResult.data.revoked_at &&
          inviteResult.data.expires_at &&
          new Date(inviteResult.data.expires_at).getTime() > Date.now()
        ) {
          const volunteerResult = await admin
            .schema("core")
            .from("volunteers")
            .select("volunteer_code,display_name")
            .eq("id", inviteResult.data.volunteer_id)
            .maybeSingle();

          if (!volunteerResult.error && volunteerResult.data) {
            invitation = {
              volunteerCode: volunteerResult.data.volunteer_code,
              displayName:
                volunteerResult.data.display_name ?? "Keluarga volunteer",
              expiresAt: inviteResult.data.expires_at,
            };
          }
        }
      }
    }
  }

  const blockingCopy =
    stateCopy ??
    (!invitation
      ? "This verification session is unavailable or has expired. Open the original invitation email again."
      : null);

  return (
    <div className="site-shell">
      <header className="site-header">
        <BrandLockup href="/" priority />
        <p className="header-status">Secure volunteer onboarding</p>
      </header>

      <main className="auth-layout">
        <section className="panel auth-panel" aria-labelledby="invite-title">
          <p className="eyebrow">Keluarga MENDAKI</p>
          <h1 id="invite-title">Accept your volunteer invitation</h1>

          {blockingCopy ? (
            <div className="notice notice-error" role="alert">
              {blockingCopy}
            </div>
          ) : (
            <>
              <p className="muted">
                This invitation is for <strong>{invitation?.displayName}</strong>{" "}
                ({invitation?.volunteerCode}). Verify one detail from your existing
                volunteer record before Keluarga activates the account.
              </p>

              {errorCopy ? (
                <div className="notice notice-error" role="alert">
                  {errorCopy}
                </div>
              ) : null}

              <form action={redeemVolunteerOnboardingInvite} noValidate>
                <div className="form-field">
                  <label htmlFor="onboarding-mobile">Mobile number</label>
                  <input
                    id="onboarding-mobile"
                    name="mobile"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    minLength={8}
                    maxLength={32}
                    required
                  />
                  <span className="form-help">
                    Enter the mobile number already recorded in your Keluarga
                    volunteer profile.
                  </span>
                </div>

                <button className="button button-primary" type="submit">
                  Verify and continue
                </button>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
