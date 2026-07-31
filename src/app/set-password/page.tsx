import type { Metadata } from "next";
import { connection } from "next/server";

import { SetPasswordForm } from "@/app/set-password/set-password-form";
import { BrandLockup } from "@/components/brand-lockup";

export const metadata: Metadata = {
  title: "Set staff password",
};

export default async function SetPasswordPage() {
  // The page reads its one-time token in the browser. Dynamic rendering lets
  // Next.js attach the request-specific CSP nonce to the form's client scripts.
  await connection();

  return (
    <div className="site-shell">
      <header className="site-header">
        <BrandLockup href="/" priority />
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
