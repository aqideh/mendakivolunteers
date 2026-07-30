import type { Metadata } from "next";
import { connection } from "next/server";

import { MagicLinkConfirmation } from "@/app/auth/confirm/magic-link-confirmation";
import { BrandLockup } from "@/components/brand-lockup";

export const metadata: Metadata = {
  title: "Completing sign in",
};

export default async function ConfirmSignInPage() {
  // CSP nonces are generated per request. Dynamic rendering lets Next.js
  // attach the current request nonce to the callback page's scripts.
  await connection();

  return (
    <div className="site-shell">
      <header className="site-header">
        <BrandLockup href="/" priority />
        <p className="header-status">Secure sign in</p>
      </header>

      <main className="auth-layout">
        <section className="panel auth-panel" aria-labelledby="confirm-title">
          <p className="eyebrow">Secure access</p>
          <h1 id="confirm-title">Completing sign in</h1>
          <p className="muted">
            Keep this page open while the portal verifies your one-time link.
          </p>
          <MagicLinkConfirmation />
        </section>
      </main>
    </div>
  );
}
