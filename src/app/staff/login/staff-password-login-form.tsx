"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  signInStaffWithPassword,
  type StaffLoginState,
} from "@/app/staff/login/actions";

const initialState: StaffLoginState = {
  status: "idle",
  message: "",
};

export function StaffPasswordLoginForm({
  nextPath,
}: Readonly<{ nextPath: string }>) {
  const [state, formAction, pending] = useActionState(
    signInStaffWithPassword,
    initialState,
  );

  return (
    <form action={formAction} noValidate>
      <input name="next" type="hidden" value={nextPath} />

      <div className="form-field">
        <label htmlFor="staff-email">Staff email</label>
        <input
          id="staff-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          required
        />
        <span className="form-help">
          Use the work email address that received your Keluarga invitation.
        </span>
      </div>

      <div className="form-field">
        <label htmlFor="staff-password">Password</label>
        <input
          id="staff-password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
        />
      </div>

      <button
        className="button button-primary"
        type="submit"
        disabled={pending}
      >
        {pending ? "Signing in..." : "Sign in with password"}
      </button>

      <p
        className="form-message"
        data-status={state.status}
        aria-live="polite"
      >
        {state.message}
      </p>

      <p className="form-help">
        Staff accounts are invitation-only. Need volunteer access instead?{" "}
        <Link href="/login">Use volunteer sign in</Link>.
      </p>
    </form>
  );
}
