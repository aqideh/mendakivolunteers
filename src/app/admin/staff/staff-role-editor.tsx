"use client";

import { Modal } from "@mantine/core";
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  function save() {
    if (pending || selectedRole === role) return;
    setConfirmOpen(false);

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

  const current = getStaffRoleOption(role);
  const next = getStaffRoleOption(selectedRole);

  return (
    <div className="phaseone-admin-form">
      <Modal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm staff access change"
        centered
      >
        <p>Change <strong>{email}</strong> from <strong>{current?.label ?? role}</strong> to <strong>{next?.label ?? selectedRole}</strong>?</p>
        <p>{next?.description}</p>
        <p>This change takes effect immediately.</p>
        {selectedRole === "admin" ? <p>Admin also grants MakLom administrator access.</p> : role === "admin" ? <p>MakLom administrator access will be removed.</p> : null}
        <div className="actions">
          <button className="button button-secondary" type="button" onClick={() => setConfirmOpen(false)}>Keep current role</button>
          <button className="button button-danger" type="button" onClick={save} disabled={pending}>Change to {next?.label ?? selectedRole}</button>
        </div>
      </Modal>
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
            onClick={() => setConfirmOpen(true)}
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
