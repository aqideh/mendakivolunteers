"use client";

import { useActionState } from "react";

import {
  changePassword,
  type PasswordChangeState,
} from "@/app/account/password/actions";

const initialState: PasswordChangeState = {
  status: "idle",
  message: "",
};

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(
    changePassword,
    initialState,
  );

  return (
    <form action={formAction} noValidate>
      <div className="form-field">
        <label htmlFor="current-password">Current password</label>
        <input
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
        <span className="form-help">
          Use at least 12 characters and do not reuse a password from another service.
        </span>
      </div>

      <div className="form-field">
        <label htmlFor="confirm-new-password">Confirm new password</label>
        <input
          id="confirm-new-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </div>

      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? "Changing password..." : "Change password"}
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
