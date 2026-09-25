import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/app/login/login-form";
import { VolunteerAuthPanel } from "@/app/login/volunteer-auth-panel";
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
  const requestedMode = Array.isArray(parameters.mode)
    ? parameters.mode[0]
    : parameters.mode;
  const nextPath = getSafeRedirectPath(requestedNext);
  const initialMode = requestedMode === "signup" ? "signup" : "signin";
  const initialError = getLoginErrorMessage(errorCode);

  return (
    <div className="site-shell auth-page">
      <header className="site-header auth-header">
        <BrandLockup href="/" priority />
      </header>

      <main className="auth-layout auth-login-layout">
        <section className="auth-panel auth-login-card" aria-labelledby="community-auth-title">

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

          <VolunteerAuthPanel initialMode={initialMode} nextPath={nextPath} />

          <details className="auth-password-disclosure">
            <summary>Staff or password login</summary>
            <div className="auth-password-disclosure-body">
              <LoginForm nextPath={nextPath} initialError={undefined} />
            </div>
          </details>

          <p className="auth-browse-link">
            <Link className="text-link" href="/opportunities">
              Continue without signing in
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
