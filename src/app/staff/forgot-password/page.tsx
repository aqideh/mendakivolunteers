import type { Metadata } from "next";
import Link from "next/link";

import { StaffForgotPasswordForm } from "@/app/staff/forgot-password/staff-forgot-password-form";
import { BrandLockup } from "@/components/brand-lockup";

export const metadata: Metadata = {
  title: "Forgot staff password",
};

type StaffForgotPasswordPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function StaffForgotPasswordPage({
  searchParams,
}: StaffForgotPasswordPageProps) {
  const parameters = await searchParams;
  const initialEmail = Array.isArray(parameters.email)
    ? parameters.email[0]
    : parameters.email;
  return (
    <div className="site-shell auth-page">
      <header className="site-header auth-header">
        <BrandLockup href="/" priority />
      </header>

      <main className="auth-layout auth-login-layout">
        <section
          className="auth-panel auth-login-card"
          aria-labelledby="staff-forgot-password-title"
        >
          <div className="auth-login-intro">
            <p className="eyebrow">Keluarga staff</p>
            <h1 id="staff-forgot-password-title">Reset your password</h1>
            <p className="auth-login-copy">
              Enter your MENDAKI work email. If it has active Keluarga staff
              access, we will send you a password reset email.
            </p>
          </div>

          <StaffForgotPasswordForm initialEmail={initialEmail ?? ""} />

          <p className="form-help">
            <Link href="/login">Return to Keluarga sign in</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
