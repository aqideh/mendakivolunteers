import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/app/login/login-form";
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
      return "This portal account is not active. Contact an administrator.";
    case "account_authorization_unavailable":
      return "The portal could not verify your account permissions. Try again shortly.";
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
  const nextPath = getSafeRedirectPath(requestedNext);
  const initialError = getLoginErrorMessage(errorCode);

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark" aria-hidden="true">
            MV
          </span>
          <span>MENDAKI Volunteer Portal</span>
        </Link>
        <p className="header-status">Staff sign in</p>
      </header>

      <main className="auth-layout">
        <section className="panel auth-panel" aria-labelledby="sign-in-title">
          <p className="eyebrow">Secure access</p>
          <h1 id="sign-in-title">Sign in</h1>
          <p className="muted">
            Enter your staff email address and password. Magic links complete
            automatically when opened in this browser.
          </p>
          <LoginForm nextPath={nextPath} initialError={initialError} />
        </section>
      </main>
    </div>
  );
}
