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

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  const requestedNext = Array.isArray(parameters.next)
    ? parameters.next[0]
    : parameters.next;
  const nextPath = getSafeRedirectPath(requestedNext);

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
            Enter your staff email address and password. Access to volunteer
            information is still controlled by your portal account and
            database security rules.
          </p>
          <LoginForm nextPath={nextPath} />
        </section>
      </main>
    </div>
  );
}
