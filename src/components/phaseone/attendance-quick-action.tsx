"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { recordAttendanceQuickAction } from "@/app/admin/events/[id]/attendance/actions";

type AttendanceAction = "mark_sign_in" | "mark_sign_out";

type QuickAttendanceButtonProps = {
  eventId: string;
  rosterId: string;
  timeslotId: string;
  action: AttendanceAction;
};

export function QuickAttendanceButton({
  eventId,
  rosterId,
  timeslotId,
  action,
}: QuickAttendanceButtonProps) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [, startRefresh] = useTransition();
  const [outcome, setOutcome] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const isCheckIn = action === "mark_sign_in";
  const idleLabel = isCheckIn ? "Check in now" : "Check out now";
  const pendingLabel = isCheckIn ? "Checking in…" : "Checking out…";
  const successLabel = isCheckIn ? "Checked in ✓" : "Checked out ✓";

  function submit() {
    if (isSaving || outcome === "success") return;

    setOutcome("idle");
    setMessage(null);
    startSaving(async () => {
      const result = await recordAttendanceQuickAction({
        eventId,
        rosterId,
        timeslotId,
        action,
      });

      if (!result.ok) {
        setOutcome("error");
        setMessage(result.error);
        return;
      }

      setOutcome("success");
      setMessage(isCheckIn ? "Check-in recorded." : "Check-out recorded.");

      // Reconcile metrics, timestamps and audit history without blocking the
      // immediate success state shown on this row.
      startRefresh(() => router.refresh());
    });
  }

  return (
    <div className="phaseone-quick-action-wrap">
      <button
        aria-busy={isSaving}
        className="button button-primary phaseone-checkin-action"
        disabled={isSaving || outcome === "success"}
        onClick={submit}
        type="button"
      >
        {isSaving ? pendingLabel : outcome === "success" ? successLabel : idleLabel}
      </button>
      {message ? (
        <p
          className={outcome === "error" ? "phaseone-inline-action-error" : "phaseone-inline-action-success"}
          role={outcome === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function WalkInSubmitButtons() {
  const { pending } = useFormStatus();

  return (
    <div className="phaseone-walk-in-actions">
      <button
        aria-busy={pending}
        className="button button-primary"
        disabled={pending}
        name="submitIntent"
        type="submit"
        value="add_and_check_in"
      >
        {pending ? "Saving walk-in…" : "Add & check in now"}
      </button>
      <button
        className="button button-secondary"
        disabled={pending}
        name="submitIntent"
        type="submit"
        value="add_only"
      >
        {pending ? "Saving…" : "Add to roster only"}
      </button>
    </div>
  );
}
