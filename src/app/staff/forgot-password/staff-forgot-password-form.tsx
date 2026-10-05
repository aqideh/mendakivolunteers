"use client";

import { useActionState } from "react";

import {
  requestStaffPasswordReset,
  type StaffForgotPasswordState,
} from "@/app/staff/forgot-password/actions";

const initialState: StaffForgotPasswordState = {
  status: "idle",
  message: "",
};

export function StaffForgotPasswordForm({
  initialEmail,
}: Readonly<{ initialEmail: string }>) {
  const [state, formAction, pending] = useActionState(
    requestStaffPasswordReset,
    initialState,
  );

  return (
    <form action={formAction} className="auth-primary-form" noValidate>
      <div className="form-field">
        <label htmlFor="staff-reset-email">MENDAKI staff email</label>
        <input
          id="staff-reset-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          maxLength={254}
          placeholder="name@mendaki.org.sg"
          defaultValue={initialEmail}
          required
          disabled={pending}
        />
      </div>

      <button
        className="button button-primary"
        type="submit"
        disabled={pending}
      >
        {pending ? "Sending…" : "Send reset email"}
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
