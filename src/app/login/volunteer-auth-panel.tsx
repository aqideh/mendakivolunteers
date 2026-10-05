"use client";

import { VolunteerSignInForm } from "@/app/login/volunteer-sign-in-form";

type VolunteerAuthPanelProps = Readonly<{
  nextPath: string;
}>;

export function VolunteerAuthPanel({ nextPath }: VolunteerAuthPanelProps) {
  return (
    <div className="volunteer-auth-panel">
      <div className="auth-login-intro">
        <h1 className="auth-login-title" id="volunteer-auth-title">
          <span>Continue to</span>
          <span className="auth-login-brand">Keluarga MENDAKI</span>
        </h1>
        <p className="auth-login-copy">
          Enter your email to get started.
        </p>
      </div>

      <VolunteerSignInForm nextPath={nextPath} />
    </div>
  );
}
