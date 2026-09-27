"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateStaffRole } from "@/app/admin/staff/actions";
import {
  getStaffRoleOption,
  type StaffInviteRole,
  staffInviteRoleOptions,
} from "@/lib/auth/staff-roles";

type StaffRoleEditorProps = Readonly<{
  userId: string;
  email: string;
  role: StaffInviteRole;
}>;

export function StaffRoleEditor({
  userId,
  email,
  role,
}: StaffRoleEditorProps) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<StaffInviteRole>(role);
  const [message, setMessage] = useState("");
  const [outcome, setOutcome] = useState<"idle" | "success" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function save() {
    if (pending || selectedRole === role) return;
    const current = getStaffRoleOption(role);
    const next = getStaffRoleOption(selectedRole);
    if (!next) return;

    const confirmed = window.confirm(
      `Change ${email} from "${current?.label ?? role}" to "${next.label}"?\n\n${next.description}\n\nThis replaces the current staff access level immediately.${selectedRole === "admin" ? "\n\nAdmin also grants MakLom administrator access." : role === "admin" ? "\n\nMakLom access will be removed." : ""}`,
    );
    if (!confirmed) {
      setSelectedRole(role);
      return;
    }

    setMessage("");
    setOutcome("idle");
    startTransition(async () => {
      const result = await updateStaffRole({ userId, role: selectedRole });
      setOutcome(result.ok ? "success" : "error");
      setMessage(result.message);
      if (result.ok) router.refresh();
      else setSelectedRole(role);
    });
  }

  return (
    <div className="phaseone-admin-form">
      <div className="form-field">
        <label htmlFor={`staff-role-${userId}`}>Access level</label>
        <div className="actions">
          <select
            disabled={pending}
            id={`staff-role-${userId}`}
            onChange={(event) =>
              setSelectedRole(event.target.value as StaffInviteRole)
            }
            value={selectedRole}
          >
            {staffInviteRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            className="button button-secondary"
            disabled={pending || selectedRole === role}
            onClick={save}
            type="button"
          >
            {pending ? "Updating…" : "Save"}
          </button>
        </div>
      </div>
      <span className="table-subtext">
        {getStaffRoleOption(role)?.description}
      </span>
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
