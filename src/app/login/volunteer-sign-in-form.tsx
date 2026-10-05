"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  continueWithEmail,
  type VolunteerOtpState,
  type VolunteerSignInState,
  verifyVolunteerEmailOtp,
} from "@/app/login/volunteer-sign-in-actions";

const initialState: VolunteerSignInState = {
  status: "idle",
  step: "email",
  message: "",
};

const initialOtpState: VolunteerOtpState = {
  status: "idle",
  message: "",
};

type VolunteerSignInFormProps = Readonly<{
  nextPath: string;
}>;

function isMendakiEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  return at > 0 && normalized.slice(at + 1) === "mendaki.org.sg";
}

export function VolunteerSignInForm({ nextPath }: VolunteerSignInFormProps) {
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState(
    continueWithEmail,
    initialState,
  );
  const [otpState, otpAction, otpPending] = useActionState(
    verifyVolunteerEmailOtp,
    initialOtpState,
  );

  const submittedEmail = state.email ?? email.trim().toLowerCase();
  const staffPasswordVisible =
    state.step === "staff_password" && isMendakiEmail(email);

  if (state.step === "otp" && state.email) {
    return (
      <div className="auth-verification-state">
        <div>
          <h2>Check your email</h2>
          <p className="auth-verification-email">
            We sent an 8-digit verification code to <strong>{state.email}</strong>.
          </p>
        </div>

        <form action={otpAction} className="auth-primary-form" noValidate>
          <input type="hidden" name="email" value={state.email} />
          <input type="hidden" name="next" value={nextPath} />
          <div className="form-field">
            <label htmlFor="volunteer-email-code">Verification code</label>
            <input
              id="volunteer-email-code"
              name="token"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{8}"
              minLength={8}
              maxLength={8}
              placeholder="00000000"
              required
              autoFocus
              disabled={otpPending}
            />
            <span className="form-help">
              Enter the 8-digit code from your email.
            </span>
          </div>

          <button
            className="button button-primary"
            type="submit"
            disabled={otpPending}
          >
            {otpPending ? "Verifying…" : "Verify and continue"}
          </button>

          <p
            className="form-message"
            data-status={otpState.status}
            aria-live="polite"
          >
            {otpState.message}
          </p>
        </form>

        <form action={formAction} className="auth-resend-form auth-resend-form-compact">
          <input type="hidden" name="email" value={state.email} />
          <input type="hidden" name="next" value={nextPath} />
          <button className="button button-secondary" type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send a new code"}
          </button>
        </form>

        <button
          className="text-link auth-change-email"
          type="button"
          onClick={() =>
            window.location.replace(
              `/login?next=${encodeURIComponent(nextPath)}`,
            )
          }
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="auth-primary-form" noValidate>
      <input type="hidden" name="next" value={nextPath} />

      <div className="form-field">
        <label htmlFor="volunteer-email">Email address</label>
        <input
          id="volunteer-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          maxLength={254}
          placeholder="you@example.com"
          required
          disabled={pending}
          value={email || submittedEmail}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      {staffPasswordVisible ? (
        <div className="form-field auth-staff-password-field">
          <label htmlFor="staff-password">Password</label>
          <input
            id="staff-password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
            autoFocus
            disabled={pending}
          />
          <Link
            className="text-link"
            href={`/staff/forgot-password?email=${encodeURIComponent(
              submittedEmail,
            )}`}
          >
            Forgot password?
          </Link>
        </div>
      ) : null}

      <button
        className="button button-primary"
        type="submit"
        disabled={pending}
      >
        {pending
          ? staffPasswordVisible
            ? "Signing in…"
            : "Continuing…"
          : staffPasswordVisible
            ? "Sign in"
            : "Continue"}
      </button>

      <p
        className="form-message"
        data-status={state.status}
        aria-live="polite"
      >
        {state.message}
      </p>
    </form>
  );
}
