import type { Metadata } from "next";

import { LoginForm } from "@/app/login/login-form";
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
  const passwordReset = Array.isArray(parameters.password_reset)
    ? parameters.password_reset[0]
    : parameters.password_reset;
  const nextPath = getSafeRedirectPath(requestedNext);
  const initialError = getLoginErrorMessage(errorCode);

  return (
    <div className="site-shell">
      <header className="site-header">
        <BrandLockup href="/" priority />
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
          {passwordReset === "success" ? (
            <div className="notice notice-success" role="status">
              Your password has been reset. Sign in with your new password.
            </div>
          ) : null}
          <LoginForm nextPath={nextPath} initialError={initialError} />
        </section>
      </main>
    </div>
  );
}
