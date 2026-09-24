"use client";

import { useActionState } from "react";

import {
  inviteStaffMember,
  type StaffInviteState,
} from "@/app/admin/staff/actions";
import { staffInviteRoleOptions } from "@/lib/auth/staff-roles";

const initialState: StaffInviteState = {
  status: "idle",
  message: "",
};

export function StaffInviteForm() {
  const [state, formAction, pending] = useActionState(
    inviteStaffMember,
    initialState,
  );

  return (
    <form className="cms-form" action={formAction}>
      <div>
        <p className="eyebrow">New staff account</p>
        <h2>Invite staff</h2>
        <p className="muted">
          KELUARGA will create the account, assign the selected staff role and
          email a secure setup link. The staff member chooses their own password.
        </p>
      </div>

      <div className="form-grid two-column">
        <div className="form-field">
          <label htmlFor="staff-invite-email">Work email</label>
          <input
            id="staff-invite-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="staff-invite-role">Role</label>
          <select id="staff-invite-role" name="role" defaultValue="admin" required>
            {staffInviteRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? "Sending invitation..." : "Invite staff"}
        </button>
      </div>

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
