import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/app/login/login-form";
import { VolunteerSignInForm } from "@/app/login/volunteer-sign-in-form";
import { BrandLockup } from "@/components/brand-lockup";
import { getSafeRedirectPath } from "@/lib/security/redirects";

export const metadata: Metadata = {
  title: "Login",
};

type LoginPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function getLoginErrorMessage(errorCode: string | undefined): string | undefined {
  switch (errorCode) {
    case "invalid_or_expired_link":
    case "magic_link_invalid":
      return "This login link is invalid, expired, or has already been used. Request a new link.";
    case "account_inactive":
      return "This Keluarga MENDAKI account is not active. Contact the volunteer team.";
    case "account_authorization_unavailable":
    case "account_setup_unavailable":
      return "Keluarga MENDAKI could not finish setting up your account. Request a new sign-in link and try again.";
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
    <div className="site-shell">
      <header className="site-header">
        <BrandLockup href="/" priority />
        <p className="header-status">Keluarga MENDAKI login</p>
      </header>

      <main className="auth-layout">
        <section className="panel auth-panel" aria-labelledby="sign-in-title">
          <p className="eyebrow">Your Keluarga MENDAKI account</p>
          <h1 id="sign-in-title">Login</h1>
          <p className="muted">
            Opportunities and news remain available without logging in. Enter your
            email to sign in or create a KELUARGA volunteer account. Your account is
            used for registrations, Event Guides, activity records and points.
          </p>

          {initialError ? (
            <div className="notice notice-error" role="alert">
              {initialError}
            </div>
          ) : null}

          {passwordReset === "success" ? (
            <div className="notice notice-success" role="status">
              Your password has been reset. Log in with your new password.
            </div>
          ) : null}

          <section aria-labelledby="volunteer-sign-in-title">
            <h2 id="volunteer-sign-in-title">Volunteer email login</h2>
            <p className="muted">
              The one-time email link logs this browser into your Keluarga MENDAKI
              account. You remain logged in until the session ends, you clear the
              browser data, or you sign out; a new email is not required for every
              visit.
            </p>
            <VolunteerSignInForm nextPath={nextPath} />
          </section>

          <details className="phaseone-disclosure">
            <summary>Staff login or use a password</summary>
            <div className="phaseone-disclosure-body">
              <p className="muted">
                Staff and existing password users can log in below.
              </p>
              <LoginForm nextPath={nextPath} initialError={undefined} />
            </div>
          </details>

          <p className="muted">
            Prefer to continue without logging in?{" "}
            <Link className="text-link" href="/opportunities">
              Browse volunteer opportunities
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
