"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPortal, useFormStatus } from "react-dom";

import {
  checkoutAllCurrentParticipants,
  extendAttendanceToShift,
  recordAttendanceQuickAction,
  withdrawVolunteerAcrossEventShifts,
} from "@/app/admin/events/[id]/attendance/actions";
import { patchRosterShiftCache } from "@/components/phaseone/roster-shift-state";

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

export type WithdrawalShiftPreview = {
  timeslotId: string;
  label: string;
  status: "pending" | "signed_in" | "signed_out" | "withdrawn" | "absent" | "anomaly" | "cancelled";
};

type WithdrawalButtonProps = {
  eventId: string;
  rosterId: string;
  timeslotId: string;
  volunteerName: string;
  shifts: WithdrawalShiftPreview[];
};

type BulkCheckoutButtonProps = {
  eventId: string;
  timeslotId: string;
  checkedInCount: number;
  shiftLabel?: string;
};

type ExtendAttendanceButtonProps = {
  eventId: string;
  rosterId: string;
  currentTimeslotId: string;
  targetTimeslotId: string;
  targetLabel: string;
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
    idle: "Withdraw",
    pending: "Marking withdrawn…",
    success: "Withdrawn ✓",
    message: "Volunteer marked as withdrawn.",
  },
  mark_absent: {
    idle: "Mark absent",
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
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [recordedAction, setRecordedAction] = useState<AttendanceQuickAction | null>(null);
  const currentOutcome = recordedAction === action ? outcome : "idle";
  const currentMessage = recordedAction === action ? message : null;
  const copy = labels[action];
  const isPrimaryAction = action === "mark_sign_in" || action === "mark_sign_out";

  const mutation = useMutation({
    mutationFn: () =>
      recordAttendanceQuickAction({
        eventId,
        rosterId,
        timeslotId,
        action,
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        setOutcome("error");
        setMessage(result.error);
        return;
      }

      patchRosterShiftCache(
        queryClient,
        eventId,
        timeslotId,
        result.attendance,
      );
      setOutcome("success");
      const timestamp =
        result.attendance.signedOutAt ??
        result.attendance.signedInAt ??
        result.attendance.updatedAt;
      const time = timestamp
        ? new Intl.DateTimeFormat("en-SG", {
            timeZone: "Asia/Singapore",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(timestamp))
        : null;
      setMessage(time ? `${copy.message} ${time}` : copy.message);
    },
    onError: () => {
      setOutcome("error");
      setMessage("The request could not be completed. Please try again.");
    },
  });

  function submit() {
    if (mutation.isPending || currentOutcome === "success") return;
    setRecordedAction(action);
    setOutcome("idle");
    setMessage(null);
    mutation.mutate();
  }

  return (
    <div className="phaseone-quick-action-wrap">
      <button
        aria-busy={mutation.isPending}
        className={`${isPrimaryAction ? "button button-primary" : "button button-secondary"} phaseone-checkin-action`}
        disabled={mutation.isPending || currentOutcome === "success"}
        onClick={submit}
        type="button"
      >
        {mutation.isPending ? <><span className="km-roster-spinner" aria-hidden="true" />{copy.pending}</> : currentOutcome === "success" ? copy.success : copy.idle}
      </button>
      {currentMessage ? (
        <p
          className={currentOutcome === "error" ? "phaseone-inline-action-error" : "phaseone-inline-action-success"}
          role={currentOutcome === "error" ? "alert" : "status"}
        >
          {currentMessage}
        </p>
      ) : null}
    </div>
  );
}

export function WithdrawalButton({
  eventId,
  rosterId,
  timeslotId,
  volunteerName,
  shifts,
}: WithdrawalButtonProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSaving, startSaving] = useTransition();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"single" | "all" | null>(null);
  const [outcome, setOutcome] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const eligibleShifts = shifts.filter((shift) => shift.status === "pending");
  const protectedShifts = shifts.filter((shift) => shift.status !== "pending");
  const hasMultipleShifts = shifts.length > 1;

  function formatBulkMessage(result: {
    withdrawn: number;
    alreadyWithdrawn: number;
    skippedActiveCheckIn: number;
    skippedAttendanceRecorded: number;
    skippedAbsent: number;
    skippedCancelled: number;
  }) {
    const parts: string[] = [];
    if (result.withdrawn > 0) {
      parts.push(`${result.withdrawn} shift${result.withdrawn === 1 ? "" : "s"} withdrawn`);
    }
    if (result.alreadyWithdrawn > 0) {
      parts.push(`${result.alreadyWithdrawn} already withdrawn`);
    }
    if (result.skippedActiveCheckIn > 0) {
      parts.push(`${result.skippedActiveCheckIn} skipped due to active check-in`);
    }
    if (result.skippedAttendanceRecorded > 0) {
      parts.push(`${result.skippedAttendanceRecorded} skipped because attendance was already recorded`);
    }
    if (result.skippedAbsent > 0) {
      parts.push(`${result.skippedAbsent} kept as absent`);
    }
    if (result.skippedCancelled > 0) {
      parts.push(`${result.skippedCancelled} cancelled shift${result.skippedCancelled === 1 ? "" : "s"} unchanged`);
    }
    return parts.length > 0 ? `${parts.join("; ")}.` : "No shifts were changed.";
  }

  function finishSuccess(nextMessage: string, refresh = true) {
    setOutcome("success");
    setMessage(nextMessage);
    setOpen(false);
    if (refresh) window.setTimeout(() => router.refresh(), 900);
  }

  function withdrawSingle() {
    if (isSaving) return;
    setChoice("single");
    setOutcome("idle");
    setMessage(null);
    startSaving(async () => {
      try {
        const result = await recordAttendanceQuickAction({
          eventId,
          rosterId,
          timeslotId,
          action: "mark_withdrawn",
        });
        if (!result.ok) {
          setOutcome("error");
          setMessage(result.error);
          setOpen(false);
          return;
        }
        patchRosterShiftCache(
          queryClient,
          eventId,
          timeslotId,
          result.attendance,
        );
        finishSuccess("Withdrawn from this shift.", false);
      } catch {
        setOutcome("error");
        setMessage("The request could not be completed. Please try again.");
        setOpen(false);
      } finally {
        setChoice(null);
      }
    });
  }

  function withdrawAll() {
    if (isSaving) return;
    setChoice("all");
    setOutcome("idle");
    setMessage(null);
    startSaving(async () => {
      try {
        const result = await withdrawVolunteerAcrossEventShifts({
          eventId,
          rosterId,
          timeslotId,
        });
        if (!result.ok) {
          setOutcome("error");
          setMessage(result.error);
          setOpen(false);
          return;
        }
        finishSuccess(formatBulkMessage(result));
      } catch {
        setOutcome("error");
        setMessage("The request could not be completed. Please try again.");
        setOpen(false);
      } finally {
        setChoice(null);
      }
    });
  }

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div
      className="km-withdraw-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) setOpen(false);
      }}
    >
      <section
        aria-labelledby={`withdraw-title-${rosterId}`}
        aria-modal="true"
        className="km-withdraw-modal"
        role="dialog"
      >
        <div className="km-withdraw-modal-header">
          <div>
            <p className="eyebrow">Roster withdrawal</p>
            <h2 id={`withdraw-title-${rosterId}`}>Withdraw volunteer?</h2>
          </div>
          <button
            aria-label="Close withdrawal dialog"
            className="km-withdraw-modal-close"
            disabled={isSaving}
            onClick={() => setOpen(false)}
            type="button"
          >
            ×
          </button>
        </div>

        <p><strong>{volunteerName}</strong> is rostered for {shifts.length} shift{shifts.length === 1 ? "" : "s"} in this event.</p>

        {hasMultipleShifts ? (
          <>
            <h3>Withdraw for all shifts?</h3>
            <div className="km-withdraw-shift-list">
              {shifts.map((shift) => (
                <div className="km-withdraw-shift-row" key={shift.timeslotId}>
                  <span>{shift.label}</span>
                  <span className="status-pill" data-state={shift.status}>
                    {shift.status === "pending"
                      ? "Can withdraw"
                      : shift.status === "signed_in"
                        ? "Checked in"
                        : shift.status === "signed_out"
                          ? "Checked out"
                          : shift.status === "withdrawn"
                            ? "Withdrawn"
                            : shift.status === "absent"
                              ? "Absent"
                              : shift.status === "cancelled"
                                ? "Cancelled"
                                : "Needs review"}
                  </span>
                </div>
              ))}
            </div>
            {protectedShifts.length > 0 ? (
              <p className="muted">
                {eligibleShifts.length} remaining shift{eligibleShifts.length === 1 ? "" : "s"} can be withdrawn.
                Existing attendance and non-attendance records will not be overwritten.
              </p>
            ) : null}
          </>
        ) : (
          <p>Withdraw {volunteerName} from this shift?</p>
        )}

        <div className="km-withdraw-modal-actions">
          <button
            className="button button-secondary km-withdraw-cancel"
            disabled={isSaving}
            onClick={() => setOpen(false)}
            type="button"
          >
            Cancel
          </button>
          {hasMultipleShifts ? (
            <button
              aria-busy={isSaving && choice === "single"}
              className="button button-secondary"
              disabled={isSaving}
              onClick={withdrawSingle}
              type="button"
            >
              {isSaving && choice === "single"
                ? <><span className="km-roster-spinner" aria-hidden="true" />Withdrawing…</>
                : "This shift only"}
            </button>
          ) : null}
          <button
            aria-busy={isSaving && choice === (hasMultipleShifts ? "all" : "single")}
            className="button button-primary"
            disabled={isSaving || (hasMultipleShifts && eligibleShifts.length === 0)}
            onClick={hasMultipleShifts ? withdrawAll : withdrawSingle}
            type="button"
          >
            {isSaving && choice === (hasMultipleShifts ? "all" : "single")
              ? <><span className="km-roster-spinner" aria-hidden="true" />Withdrawing…</>
              : hasMultipleShifts
                ? "All shifts"
                : "Withdraw"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="phaseone-quick-action-wrap">
      <button
        className="button button-secondary phaseone-checkin-action"
        disabled={isSaving}
        onClick={() => {
          setOutcome("idle");
          setMessage(null);
          setOpen(true);
        }}
        type="button"
      >
        Withdraw
      </button>
      {message ? (
        <p
          className={outcome === "error" ? "phaseone-inline-action-error" : "phaseone-inline-action-success"}
          role={outcome === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
      {modal}
    </div>
  );
}

export function ExtendAttendanceButton({
  eventId,
  rosterId,
  currentTimeslotId,
  targetTimeslotId,
  targetLabel,
}: ExtendAttendanceButtonProps) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [, startRefresh] = useTransition();
  const [outcome, setOutcome] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  function submit() {
    if (isSaving || outcome === "success") return;

    setOutcome("idle");
    setMessage(null);
    startSaving(async () => {
      try {
      const result = await extendAttendanceToShift({
        eventId,
        sourceRosterId: rosterId,
        targetTimeslotId,
        currentTimeslotId,
      });

      if (!result.ok) {
        setOutcome("error");
        setMessage(result.error);
        return;
      }

      setOutcome("success");
      setMessage(
        result.status === "already_scheduled"
          ? `Already scheduled for ${targetLabel}. Continuous attendance is active.`
          : `Extended into ${targetLabel}. No second check-in is needed.`,
      );
      startRefresh(() => router.refresh());
      } catch {
        setOutcome("error");
        setMessage("The request could not be completed. Please try again.");
      }
    });
  }

  return (
    <div className="phaseone-quick-action-wrap phaseone-extension-action">
      <button
        aria-busy={mutation.isPending}
        className="button button-secondary phaseone-checkin-action"
        disabled={isSaving || outcome === "success"}
        onClick={submit}
        type="button"
      >
        {isSaving ? `Extending to ${targetLabel}…` : outcome === "success" ? `Continuing to ${targetLabel} ✓` : `Extend to ${targetLabel}`}
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
  shiftLabel,
}: BulkCheckoutButtonProps) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [, startRefresh] = useTransition();
  const [outcome, setOutcome] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  function submit() {
    if (isSaving || checkedInCount === 0) return;

    const confirmed = window.confirm(
      `Check out all ${checkedInCount} currently checked-in volunteer${checkedInCount === 1 ? "" : "s"} for ${shiftLabel ?? "this shift"}? Continuous volunteers will be checked out of their whole event-day session.`,
    );
    if (!confirmed) return;

    setOutcome("idle");
    setMessage(null);
    startSaving(async () => {
      try {
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
      } catch {
        setOutcome("error");
        setMessage("The request could not be completed. Please try again.");
      }
    });
  }

  return (
    <div className="phaseone-bulk-checkout">
      <button
        aria-busy={mutation.isPending}
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
