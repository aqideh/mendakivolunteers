import type { Metadata } from "next";

import { StaffInviteSetupForm } from "@/app/staff/setup/staff-invite-setup-form";
import { BrandLockup } from "@/components/brand-lockup";

export const metadata: Metadata = {
  title: "Finish staff account setup",
};

export default function StaffSetupPage() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <BrandLockup href="/" priority />
        <p className="header-status">Staff account setup</p>
      </header>

      <main className="auth-layout">
        <section className="panel auth-panel" aria-labelledby="staff-setup-title">
          <p className="eyebrow">KELUARGA staff access</p>
          <h1 id="staff-setup-title">Finish account setup</h1>
          <p className="muted">
            Choose your staff password. Your assigned staff permissions become
            active after this step is completed.
          </p>
          <StaffInviteSetupForm />
        </section>
      </main>
    </div>
  );
}
