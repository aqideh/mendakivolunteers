"use client";

import { useActionState } from "react";

import {
  resendVolunteerVerificationLink,
  type VolunteerVerificationResendState,
} from "@/app/login/volunteer-sign-up-actions";

const initialState: VolunteerVerificationResendState = {
  status: "idle",
  message: "",
};

type VolunteerVerificationResendFormProps = Readonly<{
  nextPath: string;
  defaultEmail?: string;
  compact?: boolean;
}>;

export function VolunteerVerificationResendForm({
  nextPath,
  defaultEmail = "",
  compact = false,
}: VolunteerVerificationResendFormProps) {
  const [state, formAction, pending] = useActionState(
    resendVolunteerVerificationLink,
    initialState,
  );

  return (
    <form
      action={formAction}
      className={compact ? "auth-resend-form auth-resend-form-compact" : "auth-resend-form"}
      noValidate
    >
      <input type="hidden" name="next" value={nextPath} />
      <div className="form-field">
        <label htmlFor={compact ? "resend-email-compact" : "resend-email"}>
          Email address
        </label>
        <input
          id={compact ? "resend-email-compact" : "resend-email"}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          defaultValue={defaultEmail}
          placeholder="you@example.com"
          required
          disabled={pending}
        />
      </div>

      <button
        className="button button-secondary"
        type="submit"
        disabled={pending}
      >
        {pending ? "Sending…" : "Send new verification link"}
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
