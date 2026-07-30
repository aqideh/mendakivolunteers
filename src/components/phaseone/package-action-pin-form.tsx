"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { PackageAction } from "@/lib/phaseone/package-action-access";
import { packageActionLabel } from "@/lib/phaseone/package-action-access";

export function PackageActionPinForm({
  slug,
  action,
}: {
  slug: string;
  action: PackageAction;
}) {
  const router = useRouter();
  const label = packageActionLabel(action);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/phaseone/packages/${slug}/verify/${action}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pin }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? `Unable to unlock ${label.toLowerCase()}.`);
        return;
      }
      setPin("");
      router.refresh();
    } catch {
      setMessage(`Unable to unlock ${label.toLowerCase()}. Check your connection and try again.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputId = `package-${action}-pin`;

  return (
    <form className="phaseone-pin-form" onSubmit={submit}>
      <label htmlFor={inputId}>{label} PIN</label>
      <input
        id={inputId}
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{4,8}"
        minLength={4}
        maxLength={8}
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
        required
      />
      <button className="button button-primary" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Checking…" : `Unlock ${label.toLowerCase()}`}
      </button>
      {message ? <p className="phaseone-form-error" role="alert">{message}</p> : null}
    </form>
  );
}
