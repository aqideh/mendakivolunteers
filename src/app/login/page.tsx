import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/app/login/login-form";
import { VolunteerSignInForm } from "@/app/login/volunteer-sign-in-form";
import { BrandLockup } from "@/components/brand-lockup";
import { getSafeRedirectPath } from "@/lib/security/redirects";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function getLoginErrorMessage(errorCode: string | undefined): string | undefined {
  switch (errorCode) {
    case "invalid_or_expired_link":
    case "magic_link_invalid":
      return "This sign-in link is invalid, expired, or has already been used. Request a new link.";
    case "account_inactive":
      return "This KELUARGA account is not active. Contact the volunteer team.";
    case "account_authorization_unavailable":
      return "KELUARGA could not verify your account permissions. Try again shortly.";
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
        <p className="header-status">KELUARGA sign in</p>
      </header>

      <main className="auth-layout">
        <section className="panel auth-panel" aria-labelledby="sign-in-title">
          <p className="eyebrow">Your KELUARGA account</p>
          <h1 id="sign-in-title">Sign in</h1>
          <p className="muted">
            KELUARGA and YM Hub use separate sign-ins. For KELUARGA, volunteers
            can use a one-time email link instead of remembering another password.
          </p>

          {passwordReset === "success" ? (
            <div className="notice notice-success" role="status">
              Your password has been reset. Sign in with your new password.
            </div>
          ) : null}

          <section aria-labelledby="volunteer-sign-in-title">
            <h2 id="volunteer-sign-in-title">Volunteer email sign-in</h2>
            <p className="muted">
              Use the same email address you used when registering for the event.
              The link will take you to your Event Guides.
            </p>
            <VolunteerSignInForm />
          </section>

          <details className="phaseone-disclosure">
            <summary>Staff sign-in or use a password</summary>
            <div className="phaseone-disclosure-body">
              <p className="muted">
                Staff and existing password users can sign in below.
              </p>
              <LoginForm nextPath={nextPath} initialError={initialError} />
            </div>
          </details>

          <p className="muted">
            Not registered for an activity?{" "}
            <Link className="text-link" href="/opportunities">
              View volunteer opportunities
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}
