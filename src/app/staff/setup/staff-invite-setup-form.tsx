"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import {
  isValidRecoveryPassword,
  recoveryPasswordRequirements,
} from "@/lib/auth/password-recovery";
import { createClient } from "@/lib/supabase/client";

type State = Readonly<{
  status: "idle" | "saving" | "error";
  message: string;
}>;

export function StaffInviteSetupForm() {
  const [state, setState] = useState<State>({ status: "idle", message: "" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isValidRecoveryPassword(password)) {
      setState({ status: "error", message: recoveryPasswordRequirements });
      return;
    }
    if (password !== confirmPassword) {
      setState({ status: "error", message: "The passwords do not match." });
      return;
    }

    setState({ status: "saving", message: "Finishing account setup..." });
    const supabase = createClient();

    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
      setState({
        status: "error",
        message:
          "Your invitation session is no longer valid. Ask an administrator to send a new setup email.",
      });
      return;
    }

    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) {
      console.error("Unable to set invited staff password", {
        code: passwordError.code,
        status: passwordError.status,
      });
      setState({
        status: "error",
        message:
          "The password could not be saved. Check the password requirements and try again.",
      });
      return;
    }

    const { error: activationError } = await supabase
      .schema("core")
      .rpc("activate_current_staff_account");

    if (activationError) {
      console.error("Unable to activate invited staff account", {
        code: activationError.code,
        message: activationError.message,
      });
      setState({
        status: "error",
        message:
          "Your password was saved, but staff access could not be activated. Contact an administrator.",
      });
      return;
    }

    await supabase.auth.signOut({ scope: "local" });
    window.location.replace("/login?password=setup");
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="form-field">
        <label htmlFor="staff-new-password">New password</label>
        <input
          id="staff-new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={state.status === "saving"}
          required
        />
        <span className="form-help">{recoveryPasswordRequirements}</span>
      </div>

      <div className="form-field">
        <label htmlFor="staff-confirm-password">Confirm password</label>
        <input
          id="staff-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={state.status === "saving"}
          required
        />
      </div>

      <button
        className="button button-primary"
        type="submit"
        disabled={state.status === "saving"}
      >
        {state.status === "saving" ? "Finishing setup..." : "Finish setup"}
      </button>

      <p
        className="form-message"
        data-status={state.status === "error" ? "error" : "idle"}
        aria-live="polite"
      >
        {state.message}
      </p>

      <p className="form-help">
        Already finished setup? <Link href="/login">Return to staff sign in</Link>.
      </p>
    </form>
  );
}
