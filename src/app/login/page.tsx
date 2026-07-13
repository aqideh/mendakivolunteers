import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark" aria-hidden="true">
            MV
          </span>
          <span>MENDAKI Volunteer Portal</span>
        </Link>
        <p className="header-status">Passwordless sign in</p>
      </header>

      <main className="auth-layout">
        <section className="panel auth-panel" aria-labelledby="sign-in-title">
          <p className="eyebrow">Secure access</p>
          <h1 id="sign-in-title">Sign in</h1>
          <p className="muted">
            A one-time link will be sent to your email address. Access to
            volunteer information is still controlled by the linked YM Hub
            volunteer identity and database row-level security.
          </p>
          <LoginForm />
        </section>
      </main>
    </div>
  );
}
