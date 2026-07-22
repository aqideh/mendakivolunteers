"use client";

import { useActionState } from "react";

import { signInWithPassword, type LoginState } from "@/app/login/actions";

const initialLoginState: LoginState = {
  status: "idle",
  message: "",
};

type LoginFormProps = Readonly<{
  nextPath: string;
}>;

export function LoginForm({ nextPath }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(
    signInWithPassword,
    initialLoginState,
  );

  return (
    <form action={formAction} noValidate>
      <input name="next" type="hidden" value={nextPath} />

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

      <div className="form-field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
        />
      </div>

      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
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
