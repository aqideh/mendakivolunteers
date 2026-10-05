"use server";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { isMendakiWorkEmail, staffInviteRoleValues } from "@/lib/auth/staff-roles";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { getSafeRedirectPath } from "@/lib/security/redirects";
import { createEmailLinkClient } from "@/lib/supabase/email-link";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(1).max(128);
const otpSchema = z.string().trim().regex(/^\d{8}$/);

type AuthStep = "email" | "staff_password" | "otp";

export type VolunteerSignInState = Readonly<{
  status: "idle" | "success" | "error";
  step: AuthStep;
  message: string;
  email?: string;
}>;

export type VolunteerOtpState = Readonly<{
  status: "idle" | "error";
  message: string;
}>;

const genericOtpMessage =
  "We sent an 8-digit verification code to your email. Enter it below to continue.";

function volunteerDestination(
  nextPath: string,
  profileIncomplete: boolean,
): string {
  return nextPath === "/dashboard" && profileIncomplete
    ? "/profile/setup"
    : nextPath;
}

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = getPhaseOneAdminClient();
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match =
      data.users.find(
        (user) => user.email?.trim().toLowerCase() === email,
      ) ?? null;

    if (match || data.users.length < perPage) return match;
  }
}

function withoutEmailPurpose(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const cleaned = { ...(metadata ?? {}) };
  delete cleaned.email_purpose;
  return cleaned;
}

async function prepareVolunteerEmailPurpose(email: string) {
  const admin = getPhaseOneAdminClient();
  const existingUser = await findAuthUserByEmail(email);

  if (!existingUser) {
    return { email_purpose: "volunteer_signup" };
  }

  const accountResult = await admin
    .schema("core")
    .from("user_accounts")
    .select("id")
    .eq("id", existingUser.id)
    .maybeSingle();

  if (accountResult.error) {
    console.error("Unable to classify volunteer email purpose", {
      code: accountResult.error.code,
    });
    return undefined;
  }

  if (
    accountResult.data ||
    existingUser.app_metadata?.onboarding_invite_pending === true
  ) {
    return undefined;
  }

  if (existingUser.user_metadata?.email_purpose !== "volunteer_signup") {
    const metadataResult = await admin.auth.admin.updateUserById(
      existingUser.id,
      {
        user_metadata: {
          ...(existingUser.user_metadata ?? {}),
          email_purpose: "volunteer_signup",
        },
      },
    );

    if (metadataResult.error) {
      console.error("Unable to tag pending volunteer signup email", {
        code: metadataResult.error.code,
        status: metadataResult.error.status,
      });
    }
  }

  return undefined;
}

async function cleanupVolunteerEmailPurpose(user: User) {
  if (
    !Object.prototype.hasOwnProperty.call(
      user.user_metadata ?? {},
      "email_purpose",
    )
  ) {
    return;
  }

  const admin = getPhaseOneAdminClient();
  const cleanupResult = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: withoutEmailPurpose(user.user_metadata),
  });

  if (cleanupResult.error) {
    console.error("Unable to clean volunteer email purpose metadata", {
      code: cleanupResult.error.code,
      status: cleanupResult.error.status,
    });
  }
}

export async function continueWithEmail(
  _previousState: VolunteerSignInState,
  formData: FormData,
): Promise<VolunteerSignInState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) {
    return {
      status: "error",
      step: "email",
      message: "Enter a valid email address.",
    };
  }

  const email = parsedEmail.data.toLowerCase();
  const requestedNext = formData.get("next")?.toString();
  const nextPath = getSafeRedirectPath(requestedNext, "/dashboard");

  if (isMendakiWorkEmail(email)) {
    const parsedPassword = passwordSchema.safeParse(formData.get("password"));

    if (!parsedPassword.success) {
      return {
        status: "idle",
        step: "staff_password",
        message: "",
        email,
      };
    }

    const supabase = await createClient();
    const signInResult = await supabase.auth.signInWithPassword({
      email,
      password: parsedPassword.data,
    });

    if (signInResult.error || !signInResult.data.user) {
      return {
        status: "error",
        step: "staff_password",
        message: "The email or password is incorrect.",
        email,
      };
    }

    const admin = getPhaseOneAdminClient();
    const [accountResult, rolesResult] = await Promise.all([
      admin
        .schema("core")
        .from("user_accounts")
        .select("status")
        .eq("id", signInResult.data.user.id)
        .maybeSingle(),
      admin
        .schema("core")
        .from("user_roles")
        .select("role")
        .eq("user_id", signInResult.data.user.id)
        .in("role", [...staffInviteRoleValues]),
    ]);

    if (accountResult.error || rolesResult.error) {
      console.error("Staff password sign-in authorization check failed", {
        accountCode: accountResult.error?.code,
        roleCode: rolesResult.error?.code,
      });
      await supabase.auth.signOut({ scope: "local" });
      return {
        status: "error",
        step: "staff_password",
        message: "Staff access could not be verified. Please try again.",
        email,
      };
    }

    if (
      accountResult.data?.status !== "active" ||
      (rolesResult.data ?? []).length === 0
    ) {
      await supabase.auth.signOut({ scope: "local" });
      return {
        status: "error",
        step: "staff_password",
        message:
          "This MENDAKI staff email has not been granted Keluarga staff access. Please approach the Volunteer Management team for access.",
        email,
      };
    }

    redirect(getSafeRedirectPath(requestedNext, "/admin/events"));
  }

  try {
    const supabase = createEmailLinkClient();

    after(async () => {
      try {
        const signupData = await prepareVolunteerEmailPurpose(email);
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
            ...(signupData ? { data: signupData } : {}),
          },
        });

        if (error) {
          console.error("Volunteer email OTP request was not delivered", {
            code: error.code,
            status: error.status,
          });
        }
      } catch (error) {
        console.error("Volunteer email OTP background delivery failed", error);
      }
    });
  } catch (error) {
    console.error("Volunteer email OTP is not configured", error);
    return {
      status: "error",
      step: "email",
      message: "Volunteer sign-in is not configured in this environment.",
    };
  }

  return {
    status: "success",
    step: "otp",
    message: genericOtpMessage,
    email,
  };
}

export async function verifyVolunteerEmailOtp(
  _previousState: VolunteerOtpState,
  formData: FormData,
): Promise<VolunteerOtpState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  const parsedOtp = otpSchema.safeParse(formData.get("token"));

  if (!parsedEmail.success || isMendakiWorkEmail(parsedEmail.data)) {
    return {
      status: "error",
      message: "This verification request is invalid. Start again.",
    };
  }

  if (!parsedOtp.success) {
    return {
      status: "error",
      message: "Enter the 8-digit code from your email.",
    };
  }

  const email = parsedEmail.data.toLowerCase();
  const nextPath = getSafeRedirectPath(
    formData.get("next")?.toString(),
    "/dashboard",
  );
  const supabase = await createClient();

  const verifyResult = await supabase.auth.verifyOtp({
    email,
    token: parsedOtp.data,
    type: "email",
  });

  if (verifyResult.error || !verifyResult.data.user) {
    return {
      status: "error",
      message: "That code is invalid or has expired. Request a new code and try again.",
    };
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
    await supabase.auth.signOut({ scope: "local" });
    redirect("/login?error=account_setup_unavailable");
  }

  if (linkResult === "account_inactive") {
    await supabase.auth.signOut({ scope: "local" });
    redirect("/login?error=account_inactive");
  }

  if (linkResult === "staff_access_required" || linkResult === "staff_account") {
    await supabase.auth.signOut({ scope: "local" });
    redirect("/login?error=staff_access_required");
  }

  if (linkResult === "email_unverified" || linkResult === "needs_review") {
    redirect("/login?error=account_setup_unavailable");
  }

  await cleanupVolunteerEmailPurpose(verifyResult.data.user);

  let profileIncomplete = false;
  if (nextPath === "/dashboard") {
    const volunteerResult = await accountClient
      .schema("core")
      .from("volunteers")
      .select("id")
      .eq("auth_user_id", verifyResult.data.user.id)
      .maybeSingle();

    if (!volunteerResult.error && volunteerResult.data) {
      const profileResult = await accountClient
        .from("keluarga_volunteer_profiles")
        .select("onboarding_completed_at")
        .eq("volunteer_id", volunteerResult.data.id)
        .maybeSingle();

      profileIncomplete =
        !profileResult.error && !profileResult.data?.onboarding_completed_at;
    }
  }

  redirect(volunteerDestination(nextPath, profileIncomplete));
}
