import type { Metadata } from "next";
import Link from "next/link";

import { MagicLinkConfirmation } from "@/app/auth/confirm/magic-link-confirmation";

export const metadata: Metadata = {
  title: "Completing sign in",
};

export default function ConfirmSignInPage() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark" aria-hidden="true">
            MV
          </span>
          <span>MENDAKI Volunteer Portal</span>
        </Link>
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
