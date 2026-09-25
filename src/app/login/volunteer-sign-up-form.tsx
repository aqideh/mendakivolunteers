"use client";

import { useActionState } from "react";

import {
  requestVolunteerSignUpLink,
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
    requestVolunteerSignUpLink,
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
          aria-describedby="community-signup-email-help"
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
