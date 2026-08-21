import type { Metadata } from "next";
import { connection } from "next/server";

import { MagicLinkConfirmation } from "@/app/auth/confirm/magic-link-confirmation";
import { BrandLockup } from "@/components/brand-lockup";

export const metadata: Metadata = {
  title: "Secure account link",
};

export default async function ConfirmSignInPage() {
  // CSP nonces are generated per request. Dynamic rendering lets Next.js
  // attach the current request nonce to the callback page's scripts.
  await connection();

  return (
    <div className="site-shell">
      <header className="site-header">
        <BrandLockup href="/" priority />
        <p className="header-status">Secure account access</p>
      </header>

      <main className="auth-layout">
        <section className="panel auth-panel" aria-labelledby="confirm-title">
          <p className="eyebrow">Secure access</p>
          <h1 id="confirm-title">Verifying secure link</h1>
          <p className="muted">
            Keep this page open while the portal verifies your one-time link. If
            this is a password-recovery link, you will be asked to choose a new
            password here.
          </p>
          <MagicLinkConfirmation />
        </section>
      </main>
    </div>
  );
}
