"use client";

import { useActionState, useState } from "react";

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
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState(
    requestVolunteerSignInLink,
    initialState,
  );
  const staffEmail = email.trim().toLowerCase().endsWith("@mendaki.org.sg");

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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <span className="form-help" id="volunteer-email-help">
          {staffEmail
            ? "MENDAKI staff use their work email and password."
            : "Use the email linked to your Keluarga profile."}
        </span>
      </div>

      {staffEmail ? (
        <div className="form-field">
          <label htmlFor="staff-password">Password</label>
          <input
            id="staff-password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
            disabled={pending}
          />
        </div>
      ) : null}

      <button
        className="button button-primary"
        type="submit"
        disabled={pending}
      >
        {pending
          ? staffEmail
            ? "Signing in…"
            : "Sending link…"
          : staffEmail
            ? "Sign in with password"
            : "Send sign-in link"}
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
