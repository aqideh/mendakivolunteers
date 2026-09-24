"use client";

import { useActionState } from "react";

import {
  createStaffSetupLink,
  sendStaffSetupEmail,
  type StaffInviteState,
  type StaffSetupLinkState,
} from "@/app/admin/staff/actions";

const initialLinkState: StaffSetupLinkState = {
  status: "idle",
  message: "",
  link: "",
};

const initialEmailState: StaffInviteState = {
  status: "idle",
  message: "",
};

export function StaffSetupLinkForm({ userId }: Readonly<{ userId: string }>) {
  const [linkState, linkAction, linkPending] = useActionState(
    createStaffSetupLink,
    initialLinkState,
  );
  const [emailState, emailAction, emailPending] = useActionState(
    sendStaffSetupEmail,
    initialEmailState,
  );
  const linkInputId = `staff-setup-link-${userId}`;

  return (
    <div className="form-grid">
      <form action={emailAction}>
        <input name="userId" type="hidden" value={userId} />
        <button
          className="button button-primary"
          type="submit"
          disabled={emailPending}
        >
          {emailPending ? "Sending..." : "Send setup email"}
        </button>
        <p
          className="form-message"
          data-status={emailState.status}
          aria-live="polite"
        >
          {emailState.message}
        </p>
      </form>

      <details className="phaseone-disclosure">
        <summary>Manual setup link</summary>
        <div className="phaseone-disclosure-body">
          <form action={linkAction}>
            <input name="userId" type="hidden" value={userId} />
            <button
              className="button button-secondary"
              type="submit"
              disabled={linkPending}
            >
              {linkPending ? "Creating link..." : "Create setup link"}
            </button>

            <p
              className="form-message"
              data-status={linkState.status}
              aria-live="polite"
            >
              {linkState.message}
            </p>

            {linkState.link ? (
              <div className="form-field">
                <label htmlFor={linkInputId}>One-time setup link</label>
                <input
                  id={linkInputId}
                  type="url"
                  value={linkState.link}
                  readOnly
                  autoComplete="off"
                />
                <span className="form-help">
                  Copy this link now. Creating another link revokes this one.
                </span>
              </div>
            ) : null}
          </form>
        </div>
      </details>
    </div>
  );
}
