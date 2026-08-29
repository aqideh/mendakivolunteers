"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  checkoutAllCurrentParticipants,
  recordAttendanceQuickAction,
} from "@/app/admin/events/[id]/attendance/actions";

export type AttendanceQuickAction =
  | "mark_sign_in"
  | "mark_sign_out"
  | "mark_withdrawn"
  | "mark_absent"
  | "clear_non_attendance";

type QuickAttendanceButtonProps = {
  eventId: string;
  rosterId: string;
  timeslotId: string;
  action: AttendanceQuickAction;
};

type BulkCheckoutButtonProps = {
  eventId: string;
  timeslotId: string;
  checkedInCount: number;
};

const labels: Record<AttendanceQuickAction, { idle: string; pending: string; success: string; message: string }> = {
  mark_sign_in: {
    idle: "Check in now",
    pending: "Checking in…",
    success: "Checked in ✓",
    message: "Check-in recorded.",
  },
  mark_sign_out: {
    idle: "Check out now",
    pending: "Checking out…",
    success: "Checked out ✓",
    message: "Check-out recorded.",
  },
  mark_withdrawn: {
    idle: "Withdrawn",
    pending: "Marking withdrawn…",
    success: "Withdrawn ✓",
    message: "Volunteer marked as withdrawn.",
  },
  mark_absent: {
    idle: "Absent",
    pending: "Marking absent…",
    success: "Absent ✓",
    message: "Volunteer marked as absent.",
  },
  clear_non_attendance: {
    idle: "Undo status",
    pending: "Clearing status…",
    success: "Status cleared ✓",
    message: "Non-attendance status cleared.",
  },
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
  const copy = labels[action];
  const isPrimaryAction = action === "mark_sign_in" || action === "mark_sign_out";

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
      setMessage(copy.message);

      startRefresh(() => router.refresh());
    });
  }

  return (
    <div className="phaseone-quick-action-wrap">
      <button
        aria-busy={isSaving}
        className={`${isPrimaryAction ? "button button-primary" : "button button-secondary"} phaseone-checkin-action`}
        disabled={isSaving || outcome === "success"}
        onClick={submit}
        type="button"
      >
        {isSaving ? copy.pending : outcome === "success" ? copy.success : copy.idle}
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

export function BulkCheckoutButton({
  eventId,
  timeslotId,
  checkedInCount,
}: BulkCheckoutButtonProps) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [, startRefresh] = useTransition();
  const [outcome, setOutcome] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  function submit() {
    if (isSaving || checkedInCount === 0) return;

    const confirmed = window.confirm(
      `Check out all ${checkedInCount} currently checked-in volunteer${checkedInCount === 1 ? "" : "s"} for this shift?`,
    );
    if (!confirmed) return;

    setOutcome("idle");
    setMessage(null);
    startSaving(async () => {
      const result = await checkoutAllCurrentParticipants({ eventId, timeslotId });

      if (!result.ok) {
        setOutcome("error");
        setMessage(result.error);
        startRefresh(() => router.refresh());
        return;
      }

      setOutcome("success");
      setMessage(
        result.checkedOut === 0
          ? "No volunteers were still checked in."
          : `${result.checkedOut} volunteer${result.checkedOut === 1 ? "" : "s"} checked out.`,
      );
      startRefresh(() => router.refresh());
    });
  }

  return (
    <div className="phaseone-bulk-checkout">
      <button
        aria-busy={isSaving}
        className="button button-secondary phaseone-bulk-checkout-button"
        disabled={isSaving || checkedInCount === 0}
        onClick={submit}
        type="button"
      >
        {isSaving ? "Checking everyone out…" : `Check out all (${checkedInCount})`}
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
