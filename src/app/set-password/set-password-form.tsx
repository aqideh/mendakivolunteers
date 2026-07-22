"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import {
  setInitialPassword,
  type SetPasswordState,
} from "@/app/set-password/actions";

const initialState: SetPasswordState = {
  status: "idle",
  message: "",
};

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    setInitialPassword,
    initialState,
  );
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    setToken(parameters.get("token") ?? "");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  const hasToken = Boolean(token);

  return (
    <form action={formAction} noValidate>
      <input name="token" type="hidden" value={token ?? ""} />

      {token === "" ? (
        <div className="notice notice-error" role="alert">
          This password setup link is invalid or has expired. Ask an administrator
          for a new link.
        </div>
      ) : null}

      <div className="form-field">
        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
        <span className="form-help">
          Use at least 12 characters and a password that is unique to this portal.
        </span>
      </div>

      <div className="form-field">
        <label htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </div>

      <button
        className="button button-primary"
        type="submit"
        disabled={pending || token === null || !hasToken}
      >
        {pending ? "Setting password..." : "Set password"}
      </button>

      <p
        className="form-message"
        data-status={state.status}
        aria-live="polite"
      >
        {state.message}
      </p>

      <p className="form-help">
        Already set your password? <Link href="/login">Return to staff sign in</Link>.
      </p>
    </form>
  );
}
