"use client";

import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import { validateCurrentStaffRecovery } from "@/app/staff/forgot-password/actions";
import {
  getRecoveryLinkType,
  isValidRecoveryPassword,
  recoveryPasswordRequirements,
} from "@/lib/auth/password-recovery";
import { getSafeRedirectPath } from "@/lib/security/redirects";
import { createAuthCallbackClient, createClient } from "@/lib/supabase/client";

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
  const [recoveryMode, setRecoveryMode] = useState<"setup" | "reset" | null>(
    null,
  );

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
    const resolvedNextPath = getSafeRedirectPath(
      currentUrl.searchParams.get("next"),
      "/dashboard",
    );
    const flow = currentUrl.searchParams.get("flow");
    const isStaffRecovery = flow === "staff_recovery";
    const isRecovery =
      rawType === "recovery" || flow === "recovery" || isStaffRecovery;
    const isVolunteerOnboarding = flow === "volunteer_onboarding";
    const expectedRecoveryUserId = currentUrl.searchParams.get("account");
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

    async function enterRecoveryState(message: string) {
      if (isStaffRecovery) {
        const eligible = await validateCurrentStaffRecovery();
        if (!eligible) {
          await createClient().auth.signOut({ scope: "local" });
          setState({
            status: "error",
            message:
              "This password reset link can no longer be used. Staff access may have changed; request a new reset email if you still have access.",
          });
          return;
        }
        setRecoveryMode("reset");
      } else {
        setRecoveryMode("setup");
      }

      setState({
        status: "recovery",
        message,
      });
    }

    async function completeAuthentication() {
      let authError: { message: string } | null = errorDescription
        ? { message: errorDescription }
        : null;
      const supabase = createAuthCallbackClient();

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

      if (authError && !isRecovery) {
        // Email clients and mobile browsers can reopen a one-time link after it
        // has already established a valid session. If this browser already has
        // that session, continue instead of showing an expired-link error.
        const existingSessionClient = createClient();
        const { data: existingUser, error: existingUserError } =
          await existingSessionClient.auth.getUser();

        if (!existingUserError && existingUser.user) {
          authError = null;
        }
      }

      if (authError && isRecovery) {
        // A recovery URL is one-time, but the first successful verification may
        // already have established the user's recovery session. This commonly
        // happens when the page is reloaded or an email client opens the link a
        // second time. Continue only when Supabase confirms that session.
        const existingSessionClient = createClient();
        const { data: existingUser, error: existingUserError } =
          await existingSessionClient.auth.getUser();

        if (
          !existingUserError &&
          existingUser.user &&
          expectedRecoveryUserId &&
          existingUser.user.id === expectedRecoveryUserId
        ) {
          await enterRecoveryState(
            "Recovery session verified. Choose a new password below.",
          );
          return;
        }
      }

      if (authError) {
        console.error("Secure-link confirmation failed", {
          message: authError.message,
        });
        setState({
          status: "error",
          message:
            "This secure link is invalid, expired, or has already been used.",
        });
        return;
      }

      if (isRecovery) {
        await enterRecoveryState(
          "Recovery link verified. Choose a new password below.",
        );
        return;
      }

      if (isInvite) {
        window.location.replace(resolvedNextPath);
        return;
      }

      const sessionClient = createClient();
      const accountClient = sessionClient as unknown as SupabaseClient;

      if (!isVolunteerOnboarding) {
        const { data: currentUser } = await sessionClient.auth.getUser();
        if (
          currentUser.user &&
          Object.prototype.hasOwnProperty.call(
            currentUser.user.user_metadata ?? {},
            "email_purpose",
          )
        ) {
          const cleanedMetadata = { ...(currentUser.user.user_metadata ?? {}) };
          delete cleanedMetadata.email_purpose;
          const { error: cleanupError } = await sessionClient.auth.updateUser({
            data: cleanedMetadata,
          });
          if (cleanupError) {
            console.error("Unable to clean stale volunteer email purpose metadata", {
              code: cleanupError.code,
              status: cleanupError.status,
            });
          }
        }
      }

      if (isVolunteerOnboarding) {
        const { data: inviteResult, error: inviteError } = await accountClient
          .schema("core")
          .rpc("accept_current_volunteer_onboarding_invite");

        if (inviteError) {
          console.error("Volunteer onboarding invitation could not be accepted", {
            code: inviteError.code,
            message: inviteError.message,
          });
          window.location.replace("/login?error=volunteer_onboarding_unavailable");
          return;
        }

        if (inviteResult === "linked_existing" || inviteResult === "already_linked") {
          window.location.replace("/profile/setup");
          return;
        }

        if (inviteResult === "identity_conflict") {
          window.location.replace("/login?error=volunteer_onboarding_conflict");
          return;
        }

        if (inviteResult === "staff_access_required" || inviteResult === "staff_account") {
          window.location.replace("/login?error=staff_access_required");
          return;
        }

        window.location.replace("/login?error=volunteer_onboarding_unavailable");
        return;
      }

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
      if (linkResult === "staff_access_required") {
        window.location.replace("/login?error=staff_access_required");
        return;
      }
      if (linkResult === "email_unverified" || linkResult === "needs_review") {
        window.location.replace("/login?error=account_setup_unavailable");
        return;
      }

      if (resolvedNextPath === "/dashboard") {
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

      window.location.replace(resolvedNextPath);
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

    if (recoveryMode === "reset") {
      const eligible = await validateCurrentStaffRecovery();
      if (!eligible) {
        await supabase.auth.signOut({ scope: "local" });
        setState({
          status: "error",
          message:
            "Staff access is no longer active for this account. The password was not changed.",
        });
        return;
      }
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      console.error("Password recovery update failed", {
        code: error.code,
        status: error.status,
      });

      let message =
        "We couldn't update your password. Try again. If the problem continues, request a new password reset email.";

      if (error.code === "same_password") {
        message =
          "Your new password must be different from your current password.";
      } else if (error.code === "weak_password") {
        message = recoveryPasswordRequirements;
      } else if (
        error.status === 401 ||
        error.status === 403 ||
        error.code === "session_not_found"
      ) {
        message =
          "This password reset session has expired or is no longer valid. Request a new password reset email.";
      }

      setState({
        status: "recovery",
        message,
      });
      return;
    }

    if (recoveryMode === "setup") {
      const { error: activationError } = await supabase
        .schema("core")
        .rpc("activate_current_staff_account");

      if (activationError && activationError.code !== "P0001") {
        console.error("Staff activation after password setup failed", {
          code: activationError.code,
          message: activationError.message,
        });
      }
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) {
      console.error("Recovery-session sign-out failed", {
        message: signOutError.message,
      });
    }

    window.location.replace(
      recoveryMode === "reset"
        ? "/login?password_reset=success"
        : "/staff/login?password_reset=success",
    );
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
        <div className="auth-verification-recovery">
          <p className="muted">
            This one-time link may already have been used. Return to Keluarga sign
            in and request a fresh verification email if needed.
          </p>
          <Link className="button button-secondary" href="/login">
            Return to Keluarga sign in
          </Link>
        </div>
      ) : null}
    </>
  );
}
