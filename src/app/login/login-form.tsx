"use client";

import { useActionState, useEffect, useState } from "react";

import { signInWithPassword, type LoginState } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/client";

const idleLoginState: LoginState = {
  status: "idle",
  message: "",
};

type LoginFormProps = Readonly<{
  nextPath: string;
  initialError?: string;
}>;

export function LoginForm({ nextPath, initialError }: LoginFormProps) {
  const initialState: LoginState = {
    status: initialError ? "error" : "idle",
    message: initialError ?? "",
  };
  const [state, formAction, pending] = useActionState(
    signInWithPassword,
    initialState,
  );
  const [magicLinkState, setMagicLinkState] = useState<LoginState>(idleLoginState);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const hashParameters = new URLSearchParams(currentUrl.hash.slice(1));
    const code = currentUrl.searchParams.get("code");
    const accessToken = hashParameters.get("access_token");
    const refreshToken = hashParameters.get("refresh_token");
    const errorDescription =
      hashParameters.get("error_description") ??
      currentUrl.searchParams.get("error_description");
    const hasImplicitSession = Boolean(accessToken && refreshToken);

    if (!code && !hasImplicitSession && !errorDescription) {
      return;
    }

    let cancelled = false;
    setMagicLinkState({
      status: "success",
      message: "Completing secure sign-in...",
    });

    async function completeMagicLinkSignIn() {
      let authError: { message: string } | null = errorDescription
        ? { message: errorDescription }
        : null;

      if (!authError) {
        const supabase = createClient();

        if (code) {
          const result = await supabase.auth.exchangeCodeForSession(code);
          authError = result.error;
        } else if (accessToken && refreshToken) {
          const result = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          authError = result.error;
        }
      }

      currentUrl.hash = "";
      currentUrl.searchParams.delete("code");
      currentUrl.searchParams.delete("error_code");
      currentUrl.searchParams.delete("error_description");
      window.history.replaceState(
        null,
        "",
        `${currentUrl.pathname}${currentUrl.search}`,
      );

      if (cancelled) {
        return;
      }

      if (authError) {
        console.error("Magic-link sign-in failed", {
          message: authError.message,
        });
        setMagicLinkState({
          status: "error",
          message:
            "This sign-in link is invalid, expired, or has already been used. Request a new link.",
        });
        return;
      }

      window.location.replace(nextPath);
    }

    void completeMagicLinkSignIn();

    return () => {
      cancelled = true;
    };
  }, [nextPath]);

  const displayedState =
    magicLinkState.status === "idle" ? state : magicLinkState;
  const completingMagicLink = magicLinkState.status === "success";

  return (
    <form action={formAction} noValidate>
      <input name="next" type="hidden" value={nextPath} />

      <div className="form-field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          required
          disabled={completingMagicLink}
          aria-describedby="email-help"
        />
        <span className="form-help" id="email-help">
          Use the email address associated with your staff account.
        </span>
      </div>

      <div className="form-field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
          disabled={completingMagicLink}
        />
      </div>

      <button
        className="button button-primary"
        type="submit"
        disabled={pending || completingMagicLink}
      >
        {completingMagicLink
          ? "Completing sign-in..."
          : pending
            ? "Signing in..."
            : "Sign in"}
      </button>

      <p
        className="form-message"
        data-status={displayedState.status}
        aria-live="polite"
      >
        {displayedState.message}
      </p>
    </form>
  );
}
