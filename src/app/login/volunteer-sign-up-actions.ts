"use server";

import { z } from "zod";

import { getPublicConfig } from "@/lib/env";
import { getSafeRedirectPath } from "@/lib/security/redirects";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);

type EmailActionStatus = "idle" | "success" | "error";

export type VolunteerSignUpState = Readonly<{
  status: EmailActionStatus;
  message: string;
}>;

export type VolunteerVerificationResendState = Readonly<{
  status: EmailActionStatus;
  message: string;
}>;

const genericSuccessMessage =
  "If the email can receive messages, a KELUARGA account link has been sent. Open it to verify your email and finish creating your account.";

const genericResendSuccessMessage =
  "If this email has a pending KELUARGA account, a new verification link has been sent.";

function getEmailRedirectTo(nextPath: string) {
  const { appUrl } = getPublicConfig();
  const callbackUrl = new URL("/auth/confirm", appUrl);
  callbackUrl.searchParams.set("next", nextPath);
  return callbackUrl.toString();
}

function isEmailRateLimitError(error: {
  code?: string;
  status?: number;
}): boolean {
  return (
    error.status === 429 ||
    error.code === "email_rate_limit_exceeded" ||
    error.code === "over_email_send_rate_limit"
  );
}

export async function requestVolunteerSignUpLink(
  _previousState: VolunteerSignUpState,
  formData: FormData,
): Promise<VolunteerSignUpState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const email = parsedEmail.data.toLowerCase();
  const nextPath = getSafeRedirectPath(
    formData.get("next")?.toString(),
    "/dashboard",
  );

  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: getEmailRedirectTo(nextPath),
      },
    });

    if (error) {
      console.error("Volunteer sign-up link request was not delivered", {
        code: error.code,
        status: error.status,
      });

      if (isEmailRateLimitError(error)) {
        return {
          status: "error",
          message:
            "Please wait a minute before requesting another verification email.",
        };
      }
    }
  } catch (error) {
    console.error("Volunteer sign-up is not configured", error);
    return {
      status: "error",
      message: "Volunteer sign-up is not configured in this environment.",
    };
  }

  return { status: "success", message: genericSuccessMessage };
}

export async function resendVolunteerVerificationLink(
  _previousState: VolunteerVerificationResendState,
  formData: FormData,
): Promise<VolunteerVerificationResendState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const email = parsedEmail.data.toLowerCase();
  const nextPath = getSafeRedirectPath(
    formData.get("next")?.toString(),
    "/dashboard",
  );

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: getEmailRedirectTo(nextPath),
      },
    });

    if (error) {
      console.error("Volunteer verification email could not be resent", {
        code: error.code,
        status: error.status,
      });

      if (isEmailRateLimitError(error)) {
        return {
          status: "error",
          message:
            "Please wait a minute before requesting another verification email.",
        };
      }
    }
  } catch (error) {
    console.error("Volunteer verification resend is not configured", error);
    return {
      status: "error",
      message:
        "Verification email resend is not configured in this environment.",
    };
  }

  return { status: "success", message: genericResendSuccessMessage };
}
