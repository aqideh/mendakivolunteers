import type { Metadata } from "next";
import Link from "next/link";

import { VolunteerAuthPanel } from "@/app/login/volunteer-auth-panel";
import { BrandLockup } from "@/components/brand-lockup";
import { getSafeRedirectPath } from "@/lib/security/redirects";

export const metadata: Metadata = {
  title: "Continue to Keluarga MENDAKI",
};

type LoginPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function getLoginErrorMessage(errorCode: string | undefined): string | undefined {
  switch (errorCode) {
    case "account_inactive":
      return "This Keluarga MENDAKI account is not active. Contact the volunteer team.";
    case "staff_access_required":
      return "This MENDAKI staff email has not been granted Keluarga staff access. Please approach the Volunteer Management team for access.";
    case "volunteer_onboarding_conflict":
      return "This email is already connected to a different volunteer identity. Please contact the Volunteer Management team so they can review it.";
    case "volunteer_onboarding_unavailable":
      return "Keluarga MENDAKI could not complete your volunteer onboarding invitation. Please ask the Volunteer Management team to resend or review the invitation.";
    case "account_authorization_unavailable":
    case "account_setup_unavailable":
      return "Keluarga MENDAKI could not finish setting up your account. Please try again or contact the volunteer team.";
    default:
      return undefined;
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  const requestedNext = Array.isArray(parameters.next)
    ? parameters.next[0]
    : parameters.next;
  const errorCode = Array.isArray(parameters.error)
    ? parameters.error[0]
    : parameters.error;
  const passwordReset = Array.isArray(parameters.password_reset)
    ? parameters.password_reset[0]
    : parameters.password_reset;
  const nextPath = getSafeRedirectPath(requestedNext);
  const initialError = getLoginErrorMessage(errorCode);

  return (
    <div className="site-shell auth-page">
      <header className="site-header auth-header">
        <BrandLockup href="/" priority />
      </header>

      <main className="auth-layout auth-login-layout">
        <section
          className="auth-panel auth-login-card"
          aria-labelledby="volunteer-auth-title"
        >
          {initialError ? (
            <div className="notice notice-error" role="alert">
              {initialError}
            </div>
          ) : null}

          {passwordReset === "success" ? (
            <div className="notice notice-success" role="status">
              Your password has been reset. Sign in with your new password.
            </div>
          ) : null}

          <VolunteerAuthPanel nextPath={nextPath} />

          <p className="auth-browse-link">
            <Link className="text-link" href="/opportunities">
              Browse opportunities
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
