"use client";

import { useActionState } from "react";

import {
  createVolunteerPasswordAccount,
  type VolunteerSignUpState,
} from "@/app/login/volunteer-sign-up-actions";

const initialState: VolunteerSignUpState = {
  status: "idle",
  message: "",
};

type VolunteerSignUpFormProps = Readonly<{
  nextPath: string;
}>;

export function VolunteerSignUpForm({ nextPath }: VolunteerSignUpFormProps) {
  const [state, formAction, pending] = useActionState(
    createVolunteerPasswordAccount,
    initialState,
  );

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
        />
      </div>

      <div className="form-field">
        <label htmlFor="community-signup-password">Password</label>
        <input
          id="community-signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          disabled={pending}
          aria-describedby="community-signup-password-help"
        />
        <span className="form-help" id="community-signup-password-help">
          Use 12 to 128 characters with uppercase and lowercase letters and at
          least one number.
        </span>
      </div>

      <div className="form-field">
        <label htmlFor="community-signup-password-confirm">
          Confirm password
        </label>
        <input
          id="community-signup-password-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          disabled={pending}
        />
      </div>

      <button
        className="button button-primary"
        type="submit"
        disabled={pending}
      >
        {pending ? "Creating account…" : "Create account"}
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
