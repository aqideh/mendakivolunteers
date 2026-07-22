import type { Metadata } from "next";
import Link from "next/link";

import { SetPasswordForm } from "@/app/set-password/set-password-form";

export const metadata: Metadata = {
  title: "Set staff password",
};

export default function SetPasswordPage() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark" aria-hidden="true">
            MV
          </span>
          <span>MENDAKI Volunteer Portal</span>
        </Link>
        <p className="header-status">Staff password setup</p>
      </header>

      <main className="auth-layout">
        <section className="panel auth-panel" aria-labelledby="set-password-title">
          <p className="eyebrow">One-time setup</p>
          <h1 id="set-password-title">Set your staff password</h1>
          <p className="muted">
            Choose a strong password for staff access. This link works once and
            expires one hour after it is created.
          </p>
          <SetPasswordForm />
        </section>
      </main>
    </div>
  );
}
