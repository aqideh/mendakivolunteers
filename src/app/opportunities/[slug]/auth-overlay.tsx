"use client";

import { useRef, useState } from "react";

import { VolunteerAuthPanel } from "@/app/login/volunteer-auth-panel";

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
        aria-labelledby="volunteer-auth-title"
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
            aria-label="Close sign in or sign up"
            onClick={closeDialog}
          >
            ×
          </button>

          <div id="opportunity-auth-copy" className="phaseone-opportunity-auth-copy">
            Create a KELUARGA account or sign in to an existing account. Your
            selected shifts will be kept.
          </div>

          <VolunteerAuthPanel
            key={nextPath}
            initialMode="signup"
            nextPath={nextPath}
          />
        </div>
      </dialog>
    </>
  );
}
