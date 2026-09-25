"use client";

import { type MouseEvent, useRef } from "react";

import { VolunteerAuthPanel } from "@/app/login/volunteer-auth-panel";

type OpportunityAuthPromptProps = Readonly<{
  nextPath: string;
}>;

export function OpportunityAuthPrompt({
  nextPath,
}: OpportunityAuthPromptProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function openDialog() {
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      closeDialog();
    }
  }

  return (
    <>
      <button
        className="button button-primary"
        onClick={openDialog}
        type="button"
      >
        Volunteer for this activity
      </button>

      <dialog
        aria-label="Sign in or sign up to volunteer"
        className="auth-modal"
        onClick={closeOnBackdrop}
        ref={dialogRef}
      >
        <div className="auth-modal-card">
          <div className="auth-modal-toolbar">
            <button
              aria-label="Close sign in or sign up"
              className="auth-modal-close"
              onClick={closeDialog}
              type="button"
            >
              ×
            </button>
          </div>

          <VolunteerAuthPanel initialMode="signup" nextPath={nextPath} />

          <p className="auth-modal-note">
            After you verify the email link, KELUARGA will return you to this
            opportunity so you can continue your registration.
          </p>
        </div>
      </dialog>
    </>
  );
}
