"use client";

import { useActionState } from "react";

import {
  signInVolunteerWithPassword,
  type VolunteerSignInState,
} from "@/app/login/volunteer-sign-in-actions";

const initialState: VolunteerSignInState = {
  status: "idle",
  message: "",
};

type VolunteerSignInFormProps = Readonly<{
  nextPath: string;
}>;

export function VolunteerSignInForm({ nextPath }: VolunteerSignInFormProps) {
  const [state, formAction, pending] = useActionState(
    signInVolunteerWithPassword,
    initialState,
  );

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
          autoComplete="email"
          maxLength={254}
          placeholder="you@example.com"
          required
          disabled={pending}
        />
      </div>

      <div className="form-field">
        <label htmlFor="volunteer-password">Password</label>
        <input
          id="volunteer-password"
          name="password"
          type="password"
          autoComplete="current-password"
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
        {pending ? "Signing in…" : "Sign in"}
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
