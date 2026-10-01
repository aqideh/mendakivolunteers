import type { Metadata } from "next";

import { StaffPasswordLoginForm } from "@/app/staff/login/staff-password-login-form";
import { BrandLockup } from "@/components/brand-lockup";
import { getSafeRedirectPath } from "@/lib/security/redirects";

export const metadata: Metadata = {
  title: "Staff sign in",
};

type StaffLoginPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function StaffLoginPage({
  searchParams,
}: StaffLoginPageProps) {
  const parameters = await searchParams;
  const requestedNext = Array.isArray(parameters.next)
    ? parameters.next[0]
    : parameters.next;
  const setup = Array.isArray(parameters.setup)
    ? parameters.setup[0]
    : parameters.setup;
  const nextPath = getSafeRedirectPath(requestedNext, "/admin/events");

  return (
    <div className="site-shell auth-page">
      <header className="site-header auth-header">
        <BrandLockup href="/" priority />
      </header>

      <main className="auth-layout auth-login-layout">
        <section
          className="auth-panel auth-login-card"
          aria-labelledby="staff-login-title"
        >
          {setup === "success" ? (
            <div className="notice notice-success" role="status">
              Your staff account is ready. Sign in with the password you just set.
            </div>
          ) : null}

          <div className="auth-login-intro">
            <p className="eyebrow">Keluarga staff</p>
            <h1 id="staff-login-title">Staff sign in</h1>
            <p className="auth-login-copy">
              Sign in with your work email and password. Normal staff sign-in does
              not require access to your email inbox.
            </p>
          </div>

          <StaffPasswordLoginForm nextPath={nextPath} />
        </section>
      </main>
    </div>
  );
}
