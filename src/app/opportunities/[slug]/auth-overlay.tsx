"use client";

import { useRef, useState } from "react";

import { VolunteerSignInForm } from "@/app/login/volunteer-sign-in-form";

type OpportunityAuthOverlayProps = Readonly<{
  slug: string;
  shiftSelectorId: string;
}>;

export function OpportunityAuthOverlay({
  slug,
  shiftSelectorId,
}: OpportunityAuthOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [nextPath, setNextPath] = useState(`/opportunities/${slug}`);
  const [selectionError, setSelectionError] = useState("");

  function openDialog() {
    const shiftSelector = document.getElementById(shiftSelectorId);
    const selectedShiftIds = Array.from(
      shiftSelector?.querySelectorAll<HTMLInputElement>(
        'input[name="timeslotId"]:checked',
      ) ?? [],
    ).map((input) => input.value);

    if (selectedShiftIds.length === 0) {
      setSelectionError("Select at least one shift.");
      return;
    }

    const search = new URLSearchParams();
    selectedShiftIds.forEach((id) => search.append("timeslot", id));
    setNextPath(`/opportunities/${slug}?${search.toString()}`);
    setSelectionError("");
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <div className="phaseone-opportunity-registration-action">
        <button
          className="button button-primary"
          type="button"
          onClick={openDialog}
        >
          Submit registration
        </button>
      </div>

      {selectionError ? (
        <p
          className="form-message phaseone-opportunity-auth-error"
          data-status="error"
          role="alert"
        >
          {selectionError}
        </p>
      ) : null}

      <dialog
        ref={dialogRef}
        className="phaseone-opportunity-auth-dialog"
        aria-labelledby="opportunity-auth-title"
        aria-describedby="opportunity-auth-copy"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeDialog();
          }
        }}
      >
        <div className="phaseone-opportunity-auth-card">
          <button
            className="phaseone-opportunity-auth-close"
            type="button"
            aria-label="Close sign in"
            onClick={closeDialog}
          >
            ×
          </button>

          <div className="phaseone-opportunity-auth-intro">
            <h2 id="opportunity-auth-title">Sign in or sign up</h2>
            <p id="opportunity-auth-copy">
              Enter your email and we&apos;ll send you a secure link. If you
              already have a KELUARGA account, it signs you in. If you
              don&apos;t, the same link creates your account.
            </p>
          </div>

          <VolunteerSignInForm key={nextPath} nextPath={nextPath} />
        </div>
      </dialog>
    </>
  );
}
