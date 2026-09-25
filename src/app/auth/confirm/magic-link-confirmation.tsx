"use client";

import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import {
  getRecoveryLinkType,
  isValidRecoveryPassword,
  recoveryPasswordRequirements,
} from "@/lib/auth/password-recovery";
import { getSafeRedirectPath } from "@/lib/security/redirects";
import { createClient } from "@/lib/supabase/client";

const allowedOtpTypes = new Set<EmailOtpType>([
  "email",
  "magiclink",
  "recovery",
  "invite",
]);

type ConfirmationState = Readonly<{
  status: "working" | "recovery" | "saving" | "error";
  message: string;
}>;

export function MagicLinkConfirmation() {
  const [state, setState] = useState<ConfirmationState>({
    status: "working",
    message: "Verifying your secure link...",
  });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const hashParameters = new URLSearchParams(currentUrl.hash.slice(1));
    const code = currentUrl.searchParams.get("code");
    const tokenHash = currentUrl.searchParams.get("token_hash");
    const rawType = getRecoveryLinkType(
      currentUrl.searchParams.get("type"),
      hashParameters.get("type"),
    );
    const accessToken = hashParameters.get("access_token");
    const refreshToken = hashParameters.get("refresh_token");
    const errorDescription =
      hashParameters.get("error_description") ??
      currentUrl.searchParams.get("error_description");
    const nextPath = getSafeRedirectPath(
      currentUrl.searchParams.get("next"),
      "/dashboard",
    );
    const isRecovery = rawType === "recovery";
    const isInvite = rawType === "invite";

    const cleanedUrl = new URL(currentUrl);
    cleanedUrl.hash = "";
    cleanedUrl.searchParams.delete("code");
    cleanedUrl.searchParams.delete("token_hash");
    cleanedUrl.searchParams.delete("type");
    cleanedUrl.searchParams.delete("error_code");
    cleanedUrl.searchParams.delete("error_description");
    window.history.replaceState(
      null,
      "",
      `${cleanedUrl.pathname}${cleanedUrl.search}`,
    );

    let cancelled = false;

    async function completeAuthentication() {
      let authError: { message: string } | null = errorDescription
        ? { message: errorDescription }
        : null;
      const supabase = createClient();

      if (!authError && code) {
        const result = await supabase.auth.exchangeCodeForSession(code);
        authError = result.error;
      } else if (
        !authError &&
        tokenHash &&
        rawType &&
        allowedOtpTypes.has(rawType as EmailOtpType)
      ) {
        const result = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: rawType as EmailOtpType,
        });
        authError = result.error;
      } else if (!authError && accessToken && refreshToken) {
        const result = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        authError = result.error;
      } else if (!authError) {
        authError = { message: "No authentication credentials were supplied." };
      }

      if (cancelled) {
        return;
      }

      if (authError) {
        console.error("Secure-link confirmation failed", {
          message: authError.message,
        });
        setState({
          status: "error",
          message:
            "This secure link is invalid, expired, or has already been used. Request a new link.",
        });
        return;
      }

      if (isRecovery) {
        setState({
          status: "recovery",
          message: "Recovery link verified. Choose a new password below.",
        });
        return;
      }

      if (isInvite) {
        window.location.replace(nextPath);
        return;
      }

      const accountClient = supabase as unknown as SupabaseClient;
      const { data: linkResult, error: linkError } = await accountClient
        .schema("core")
        .rpc("ensure_current_keluarga_volunteer");

      if (linkError) {
        console.error("Verified KELUARGA account could not be provisioned", {
          code: linkError.code,
          message: linkError.message,
        });
        window.location.replace("/login?error=account_setup_unavailable");
        return;
      }

      if (linkResult === "account_inactive") {
        window.location.replace("/login?error=account_inactive");
        return;
      }
      if (linkResult === "email_unverified" || linkResult === "needs_review") {
        window.location.replace("/login?error=account_setup_unavailable");
        return;
      }

      if (nextPath === "/dashboard") {
        const volunteerResult = await accountClient
          .schema("core")
          .from("volunteers")
          .select("id")
          .eq("auth_user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
          .maybeSingle();

        if (!volunteerResult.error && volunteerResult.data) {
          const profileResult = await accountClient
            .from("keluarga_volunteer_profiles")
            .select("onboarding_completed_at")
            .eq("volunteer_id", volunteerResult.data.id)
            .maybeSingle();

          if (
            !profileResult.error &&
            !profileResult.data?.onboarding_completed_at
          ) {
            window.location.replace("/profile/setup");
            return;
          }
        }
      }

      window.location.replace(nextPath);
    }

    void completeAuthentication();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isValidRecoveryPassword(newPassword)) {
      setState({
        status: "recovery",
        message: recoveryPasswordRequirements,
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setState({
        status: "recovery",
        message: "The new passwords do not match.",
      });
      return;
    }

    setState({
      status: "saving",
      message: "Updating your password...",
    });

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      console.error("Password recovery update failed", {
        code: error.code,
        status: error.status,
      });
      setState({
        status: "recovery",
        message:
          "The password could not be updated. The recovery link may have expired; request a new one and try again.",
      });
      return;
    }

    const { error: activationError } = await supabase
      .schema("core")
      .rpc("activate_current_staff_account");

    if (activationError && activationError.code !== "P0001") {
      console.error("Staff activation after password recovery failed", {
        code: activationError.code,
        message: activationError.message,
      });
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) {
      console.error("Recovery-session sign-out failed", {
        message: signOutError.message,
      });
    }

    window.location.replace("/login?password_reset=success");
  }

  const resettingPassword = state.status === "recovery" || state.status === "saving";

  return (
    <>
      <p
        className="form-message"
        data-status={state.status === "error" ? "error" : "success"}
        aria-live="polite"
      >
        {state.message}
      </p>

      {resettingPassword ? (
        <form onSubmit={handlePasswordReset} noValidate>
          <div className="form-field">
            <label htmlFor="recovery-new-password">New password</label>
            <input
              id="recovery-new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={newPassword}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setNewPassword(event.target.value)
              }
              required
              disabled={state.status === "saving"}
            />
            <span className="form-help">
              Use 12 to 128 characters with uppercase and lowercase letters and at
              least one number.
            </span>
          </div>

          <div className="form-field">
            <label htmlFor="recovery-confirm-password">Confirm new password</label>
            <input
              id="recovery-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={confirmPassword}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setConfirmPassword(event.target.value)
              }
              required
              disabled={state.status === "saving"}
            />
          </div>

          <button
            className="button button-primary"
            type="submit"
            disabled={state.status === "saving"}
          >
            {state.status === "saving" ? "Updating password..." : "Reset password"}
          </button>
        </form>
      ) : null}

      {state.status === "error" ? (
        <Link className="button button-secondary" href="/login">
          Return to sign in
        </Link>
      ) : null}
    </>
  );
}
