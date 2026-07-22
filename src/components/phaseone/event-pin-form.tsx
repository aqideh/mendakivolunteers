"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function EventPinForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/phaseone/events/${slug}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(payload.error ?? "Unable to verify the PIN.");
        return;
      }
      setPin("");
      router.refresh();
    } catch {
      setMessage("Unable to verify the PIN. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="phaseone-pin-form" onSubmit={submit}>
      <label htmlFor="event-pin">Event PIN</label>
      <input
        id="event-pin"
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
        {isSubmitting ? "Checking…" : "Unlock event access"}
      </button>
      {message ? <p className="phaseone-form-error" role="alert">{message}</p> : null}
    </form>
  );
}
