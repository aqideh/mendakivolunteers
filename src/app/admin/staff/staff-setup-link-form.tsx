"use client";

import { useActionState } from "react";

import {
  createStaffSetupLink,
  type StaffSetupLinkState,
} from "@/app/admin/staff/actions";

const initialState: StaffSetupLinkState = {
  status: "idle",
  message: "",
  link: "",
};

export function StaffSetupLinkForm({ userId }: Readonly<{ userId: string }>) {
  const [state, formAction, pending] = useActionState(
    createStaffSetupLink,
    initialState,
  );
  const linkInputId = `staff-setup-link-${userId}`;

  return (
    <form action={formAction}>
      <input name="userId" type="hidden" value={userId} />
      <button className="button button-secondary" type="submit" disabled={pending}>
        {pending ? "Creating link..." : "Create setup link"}
      </button>

      <p
        className="form-message"
        data-status={state.status}
        aria-live="polite"
      >
        {state.message}
      </p>

      {state.link ? (
        <div className="form-field">
          <label htmlFor={linkInputId}>One-time setup link</label>
          <input
            id={linkInputId}
            type="url"
            value={state.link}
            readOnly
            autoComplete="off"
          />
          <span className="form-help">
            Copy this link now. Creating another link revokes this one.
          </span>
        </div>
      ) : null}
    </form>
  );
}
