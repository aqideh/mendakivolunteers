"use client";

import { useActionState } from "react";

import { requestMagicLink, type LoginState } from "@/app/login/actions";

const initialLoginState: LoginState = {
  status: "idle",
  message: "",
};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    requestMagicLink,
    initialLoginState,
  );

  return (
    <form action={formAction} noValidate>
      <div className="form-field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          required
          aria-describedby="email-help"
        />
        <span className="form-help" id="email-help">
          Use the email address associated with your volunteer account.
        </span>
      </div>

      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? "Requesting link..." : "Email me a sign-in link"}
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
