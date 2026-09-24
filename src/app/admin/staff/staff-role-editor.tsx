"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  grantStaffRole,
  revokeStaffRole,
} from "@/app/admin/staff/actions";
import {
  getStaffRoleOption,
  type StaffInviteRole,
  staffInviteRoleOptions,
} from "@/lib/auth/staff-roles";

type StaffRoleEditorProps = Readonly<{
  userId: string;
  email: string;
  roles: readonly StaffInviteRole[];
}>;

export function StaffRoleEditor({
  userId,
  email,
  roles,
}: StaffRoleEditorProps) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState("");
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState<"idle" | "success" | "error">("idle");
  const [pending, startTransition] = useTransition();

  const availableRoles = useMemo(
    () => staffInviteRoleOptions.filter((option) => !roles.includes(option.value)),
    [roles],
  );

  function grantSelectedRole() {
    const option = staffInviteRoleOptions.find(
      ({ value }) => value === selectedRole,
    );
    if (!option || pending) return;

    const confirmed = window.confirm(
      `Grant "${option.label}" to ${email}?\n\n${option.description}\n\nThis permission becomes effective immediately.`,
    );
    if (!confirmed) return;

    setMessage("");
    setOutcome("idle");
    startTransition(async () => {
      const result = await grantStaffRole({ userId, role: option.value });
      setOutcome(result.ok ? "success" : "error");
      setMessage(result.message);
      if (result.ok) {
        setSelectedRole("");
        router.refresh();
      }
    });
  }

  function revoke(role: StaffInviteRole) {
    if (pending) return;
    const option = getStaffRoleOption(role);
    const label = option?.label ?? role;

    const confirmed = window.confirm(
      `Remove "${label}" from ${email}?\n\nAccess provided by this role will stop immediately. Other assigned roles will remain unchanged.`,
    );
    if (!confirmed) return;

    setMessage("");
    setOutcome("idle");
    startTransition(async () => {
      const result = await revokeStaffRole({ userId, role });
      setOutcome(result.ok ? "success" : "error");
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="phaseone-admin-form">
      <div className="actions">
        {roles.map((role) => {
          const option = getStaffRoleOption(role);
          return (
            <span className="status-pill" key={role}>
              {option?.label ?? role}
              <button
                aria-label={`Remove ${option?.label ?? role} from ${email}`}
                className="button-reset text-link"
                disabled={pending}
                onClick={() => revoke(role)}
                type="button"
              >
                Remove
              </button>
            </span>
          );
        })}
      </div>

      {availableRoles.length > 0 ? (
        <div className="form-field">
          <label htmlFor={`staff-role-${userId}`}>Grant additional role</label>
          <div className="actions">
            <select
              disabled={pending}
              id={`staff-role-${userId}`}
              onChange={(event) => setSelectedRole(event.target.value)}
              value={selectedRole}
            >
              <option value="">Select role…</option>
              {availableRoles.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className="button button-secondary"
              disabled={pending || !selectedRole}
              onClick={grantSelectedRole}
              type="button"
            >
              {pending ? "Updating…" : "Grant role"}
            </button>
          </div>
        </div>
      ) : (
        <span className="table-subtext">All KELUARGA staff roles assigned.</span>
      )}

      {message ? (
        <p
          className="form-message"
          data-status={outcome}
          role={outcome === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
