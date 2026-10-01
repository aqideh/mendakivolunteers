"use client";

import { useActionState, useState } from "react";

import {
  requestVolunteerSignUpLink,
  type VolunteerSignUpState,
} from "@/app/login/volunteer-sign-up-actions";
import { VolunteerVerificationResendForm } from "@/app/login/volunteer-verification-resend-form";

const initialState: VolunteerSignUpState = {
  status: "idle",
  message: "",
};

type VolunteerSignUpFormProps = Readonly<{
  nextPath: string;
}>;

export function VolunteerSignUpForm({ nextPath }: VolunteerSignUpFormProps) {
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState(
    requestVolunteerSignUpLink,
    initialState,
  );

  if (state.status === "success") {
    return (
      <div className="auth-verification-state">
        <p className="form-message" data-status="success" aria-live="polite">
          {state.message}
        </p>
        <p className="auth-verification-email">
          Verification email sent to <strong>{email}</strong>.
        </p>
        <VolunteerVerificationResendForm
          nextPath={nextPath}
          defaultEmail={email}
          compact
        />
        <button
          className="text-link auth-change-email"
          type="button"
          onClick={() => window.location.reload()}
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
        <label htmlFor="community-signup-email">Email address</label>
        <input
          id="community-signup-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          placeholder="you@example.com"
          required
          disabled={pending}
          aria-describedby="community-signup-email-help"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <span className="form-help" id="community-signup-email-help">
          Use an email address you can access. You will verify it before your
          KELUARGA account is created.
        </span>
      </div>

      <button
        className="button button-primary"
        type="submit"
        disabled={pending}
      >
        {pending ? "Sending link…" : "Send sign-up link"}
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
