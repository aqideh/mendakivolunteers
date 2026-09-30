"use server";

import { createHmac } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  isValidRecoveryPassword,
  recoveryPasswordRequirements,
} from "@/lib/auth/password-recovery";
import {
  getPhaseOneAdminClient,
  getPhaseOneServerSecret,
} from "@/lib/phaseone/admin";
import { getSafeRedirectPath } from "@/lib/security/redirects";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(1).max(128);

const CLIENT_ATTEMPT_LIMIT = 5;
const EMAIL_ATTEMPT_LIMIT = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

type SignUpStatus = "idle" | "success" | "error";

export type VolunteerSignUpState = Readonly<{
  status: SignUpStatus;
  message: string;
}>;

function hashSignupKey(value: string): string {
  return createHmac("sha256", getPhaseOneServerSecret())
    .update(value)
    .digest("hex");
}

async function signupRateLimitKeys(email: string) {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const clientAddress =
    requestHeaders.get("cf-connecting-ip") ??
    forwardedFor?.split(",")[0]?.trim() ??
    "unknown";

  return {
    clientKey: hashSignupKey(`client:${clientAddress}`),
    emailKey: hashSignupKey(`email:${email}`),
  };
}

async function isSignupRateLimited(
  clientKey: string,
  emailKey: string,
): Promise<boolean> {
  const admin = getPhaseOneAdminClient();
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  const [clientResult, emailResult] = await Promise.all([
    admin
      .schema("core")
      .from("auth_signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("client_key", clientKey)
      .gte("attempted_at", since),
    admin
      .schema("core")
      .from("auth_signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email_key", emailKey)
      .gte("attempted_at", since),
  ]);

  if (clientResult.error || emailResult.error) {
    console.error("Volunteer signup abuse controls could not be checked", {
      clientCode: clientResult.error?.code,
      emailCode: emailResult.error?.code,
    });
    throw new Error("Signup abuse controls unavailable");
  }

  return (
    (clientResult.count ?? 0) >= CLIENT_ATTEMPT_LIMIT ||
    (emailResult.count ?? 0) >= EMAIL_ATTEMPT_LIMIT
  );
}

async function recordSignupAttempt(
  clientKey: string,
  emailKey: string,
  wasSuccessful: boolean,
) {
  const admin = getPhaseOneAdminClient();
  const result = await admin
    .schema("core")
    .from("auth_signup_attempts")
    .insert({
      client_key: clientKey,
      email_key: emailKey,
      was_successful: wasSuccessful,
    });

  if (result.error) {
    console.error("Volunteer signup attempt could not be recorded", {
      code: result.error.code,
    });
  }
}

export async function createVolunteerPasswordAccount(
  _previousState: VolunteerSignUpState,
  formData: FormData,
): Promise<VolunteerSignUpState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  const parsedPassword = passwordSchema.safeParse(formData.get("password"));
  const confirmPassword = formData.get("confirmPassword");

  if (!parsedEmail.success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  if (
    !parsedPassword.success ||
    !isValidRecoveryPassword(parsedPassword.data)
  ) {
    return { status: "error", message: recoveryPasswordRequirements };
  }

  if (
    typeof confirmPassword !== "string" ||
    parsedPassword.data !== confirmPassword
  ) {
    return { status: "error", message: "The passwords do not match." };
  }

  const email = parsedEmail.data.toLowerCase();
  const nextPath = getSafeRedirectPath(
    formData.get("next")?.toString(),
    "/dashboard",
  );

  let clientKey: string;
  let emailKey: string;

  try {
    ({ clientKey, emailKey } = await signupRateLimitKeys(email));
    if (await isSignupRateLimited(clientKey, emailKey)) {
      await recordSignupAttempt(clientKey, emailKey, false);
      return {
        status: "error",
        message:
          "Too many account creation attempts. Please try again in about 15 minutes.",
      };
    }
  } catch (error) {
    console.error("Volunteer signup abuse controls are unavailable", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      status: "error",
      message: "Account creation is temporarily unavailable. Please try again.",
    };
  }

  const admin = getPhaseOneAdminClient();
  const createResult = await admin.auth.admin.createUser({
    email,
    password: parsedPassword.data,
    email_confirm: true,
    app_metadata: {
      keluarga_email_ownership_verified: false,
      keluarga_signup_method: "password_without_email",
    },
  });

  if (createResult.error || !createResult.data.user) {
    await recordSignupAttempt(clientKey, emailKey, false);
    console.error("Volunteer password account could not be created", {
      code: createResult.error?.code,
      status: createResult.error?.status,
    });
    return {
      status: "error",
      message:
        "The account could not be created. If you have used this email before, sign in instead.",
    };
  }

  const createdUserId = createResult.data.user.id;

  try {
    const supabase = await createClient();
    const signInResult = await supabase.auth.signInWithPassword({
      email,
      password: parsedPassword.data,
    });

    if (signInResult.error) {
      throw signInResult.error;
    }

    const accountClient = supabase as unknown as SupabaseClient;
    const ensureResult = await accountClient
      .schema("core")
      .rpc("ensure_current_keluarga_volunteer");

    if (
      ensureResult.error ||
      !["created_unverified", "already_linked"].includes(
        String(ensureResult.data ?? ""),
      )
    ) {
      console.error("New volunteer identity could not be provisioned", {
        code: ensureResult.error?.code,
        result: ensureResult.data,
      });
      throw new Error("Volunteer identity provisioning failed");
    }

    await recordSignupAttempt(clientKey, emailKey, true);
  } catch (error) {
    console.error("Volunteer password signup could not be completed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });

    try {
      await admin.auth.admin.deleteUser(createdUserId);
    } catch (cleanupError) {
      console.error("Incomplete volunteer account cleanup failed", {
        message:
          cleanupError instanceof Error ? cleanupError.message : "Unknown error",
      });
    }

    await recordSignupAttempt(clientKey, emailKey, false);
    return {
      status: "error",
      message: "The account could not be completed. Please try again.",
    };
  }

  redirect(nextPath === "/dashboard" ? "/profile/setup" : nextPath);
}
