"use client";

import { useFormStatus } from "react-dom";

type PendingButtonProps = Readonly<{
  label: string;
}>;

export function PendingButton({ label }: PendingButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className="button button-primary"
      type="submit"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <span className="button-loading-spinner" aria-hidden="true" />
          Sending...
        </>
      ) : (
        label
      )}
    </button>
  );
}
