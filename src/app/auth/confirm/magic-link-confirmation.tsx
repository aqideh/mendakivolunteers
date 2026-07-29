"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getSafeRedirectPath } from "@/lib/security/redirects";
import { createClient } from "@/lib/supabase/client";

const allowedOtpTypes = new Set<EmailOtpType>(["email", "magiclink"]);

type ConfirmationState = Readonly<{
  status: "working" | "error";
  message: string;
}>;

export function MagicLinkConfirmation() {
  const [state, setState] = useState<ConfirmationState>({
    status: "working",
    message: "Completing secure sign-in...",
  });

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const hashParameters = new URLSearchParams(currentUrl.hash.slice(1));
    const code = currentUrl.searchParams.get("code");
    const tokenHash = currentUrl.searchParams.get("token_hash");
    const rawType = currentUrl.searchParams.get("type");
    const accessToken = hashParameters.get("access_token");
    const refreshToken = hashParameters.get("refresh_token");
    const errorDescription =
      hashParameters.get("error_description") ??
      currentUrl.searchParams.get("error_description");
    const nextPath = getSafeRedirectPath(
      currentUrl.searchParams.get("next"),
      "/dashboard",
    );

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

    async function completeSignIn() {
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
        console.error("Magic-link confirmation failed", {
          message: authError.message,
        });
        setState({
          status: "error",
          message:
            "This sign-in link is invalid, expired, or has already been used. Request a new link.",
        });
        return;
      }

      window.location.replace(nextPath);
    }

    void completeSignIn();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <p
        className="form-message"
        data-status={state.status === "error" ? "error" : "success"}
        aria-live="polite"
      >
        {state.message}
      </p>
      {state.status === "error" ? (
        <Link className="button button-secondary" href="/login">
          Return to sign in
        </Link>
      ) : null}
    </>
  );
}
