"use client";

import { VolunteerSignInForm } from "@/app/login/volunteer-sign-in-form";

type VolunteerAuthPanelProps = Readonly<{
  nextPath: string;
}>;

export function VolunteerAuthPanel({ nextPath }: VolunteerAuthPanelProps) {
  return (
    <div className="volunteer-auth-panel">
      <div className="auth-login-intro">
        <h1 id="volunteer-auth-title">Continue to Keluarga MENDAKI</h1>
        <p className="auth-login-copy">
          Enter your email to get started.
        </p>
      </div>

      <VolunteerSignInForm nextPath={nextPath} />
    </div>
  );
}
