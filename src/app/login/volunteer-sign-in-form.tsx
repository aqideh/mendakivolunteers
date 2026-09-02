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

export function VolunteerSignInForm() {
  const [state, formAction, pending] = useActionState(
    requestVolunteerSignInLink,
    initialState,
  );

  return (
    <form action={formAction} noValidate>
      <div className="form-field">
        <label htmlFor="volunteer-email">Email address</label>
        <input
          id="volunteer-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          required
          disabled={pending}
          aria-describedby="volunteer-email-help"
        />
        <span className="form-help" id="volunteer-email-help">
          Use the same email address you used when registering for the volunteer
          activity.
        </span>
      </div>

      <button
        className="button button-primary"
        type="submit"
        disabled={pending}
      >
        {pending ? "Sending sign-in link…" : "Email me a sign-in link"}
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
