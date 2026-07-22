import type { Metadata } from "next";
import Link from "next/link";

import { PasswordForm } from "@/app/account/password/password-form";
import { PortalHeader } from "@/components/portal-header";
import { requireActiveAccount } from "@/lib/auth/account-access";

export const metadata: Metadata = {
  title: "Change password",
};

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  await requireActiveAccount("/account/password");

  return (
    <div className="site-shell">
      <PortalHeader status="Account security" dashboard />
      <main className="auth-layout">
        <section className="panel auth-panel" aria-labelledby="password-title">
          <p className="eyebrow">Account security</p>
          <h1 id="password-title">Change your password</h1>
          <p className="muted">
            Confirm your current password, then choose a strong password that is
            unique to this portal.
          </p>
          <PasswordForm />
          <p className="form-help">
            <Link href="/dashboard">Return to the dashboard</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
