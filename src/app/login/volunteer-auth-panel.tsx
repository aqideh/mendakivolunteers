"use client";

import { useState } from "react";

import { VolunteerSignInForm } from "@/app/login/volunteer-sign-in-form";
import { VolunteerSignUpForm } from "@/app/login/volunteer-sign-up-form";

export type VolunteerAuthMode = "signin" | "signup";

type VolunteerAuthPanelProps = Readonly<{
  nextPath: string;
  initialMode?: VolunteerAuthMode;
}>;

export function VolunteerAuthPanel({
  nextPath,
  initialMode = "signin",
}: VolunteerAuthPanelProps) {
  const [mode, setMode] = useState<VolunteerAuthMode>(initialMode);
  const signingUp = mode === "signup";

  return (
    <div className="volunteer-auth-panel">
      <div
        className="auth-mode-switch"
        role="tablist"
        aria-label="Community volunteer account"
      >
        <button
          aria-selected={!signingUp}
          className="auth-mode-button"
          onClick={() => setMode("signin")}
          role="tab"
          type="button"
        >
          Sign in
        </button>
        <button
          aria-selected={signingUp}
          className="auth-mode-button"
          onClick={() => setMode("signup")}
          role="tab"
          type="button"
        >
          Sign up
        </button>
      </div>

      <div className="auth-login-intro">
        <h1 id="community-auth-title">
          {signingUp ? "Create your account" : "Sign in"}
        </h1>
        <p className="auth-login-copy">
          {signingUp
            ? "Community volunteers can create a KELUARGA account with their email address. No password is needed."
            : "Enter the email linked to your KELUARGA account and we’ll send you a secure sign-in link."}
        </p>
      </div>

      {signingUp ? (
        <VolunteerSignUpForm nextPath={nextPath} />
      ) : (
        <VolunteerSignInForm nextPath={nextPath} />
      )}
    </div>
  );
}
