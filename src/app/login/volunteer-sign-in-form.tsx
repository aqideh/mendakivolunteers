"use client";

import { useActionState } from "react";

import {
  requestVolunteerSignInLink,
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
    requestVolunteerSignInLink,
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
          aria-describedby="volunteer-email-help"
        />
        <span className="form-help" id="volunteer-email-help">
          Use the email linked to your Keluarga profile.
        </span>
      </div>

      <button
        className="button button-primary"
        type="submit"
        disabled={pending}
      >
        {pending ? "Sending link…" : "Send sign-in link"}
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
