"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";

import { isMendakiWorkEmail, staffInviteRoleValues } from "@/lib/auth/staff-roles";
import { getPublicConfig } from "@/lib/env";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { getSafeRedirectPath } from "@/lib/security/redirects";
import { createClient } from "@/lib/supabase/server";
import { createEmailLinkClient } from "@/lib/supabase/email-link";

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(1).max(128);

const staffAccessMessage =
  "This work email isn’t set up for Keluarga staff access yet. Please contact the Volunteer Management team if you need access.";

export type VolunteerSignInState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

const genericSuccessMessage =
  "Request received. If the email is linked to a Keluarga profile, a sign-in link is being sent. It may take a moment to arrive. Check your inbox and junk folder.";

export async function requestVolunteerSignInLink(
  _previousState: VolunteerSignInState,
  formData: FormData,
): Promise<VolunteerSignInState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const email = parsedEmail.data.toLowerCase();
  const requestedNext = formData.get("next")?.toString();
  const nextPath = getSafeRedirectPath(requestedNext, "/dashboard");

  if (isMendakiWorkEmail(email)) {
    const parsedPassword = passwordSchema.safeParse(formData.get("password"));
    const admin = getPhaseOneAdminClient();

    const accountResult = await admin
      .schema("core")
      .from("user_accounts")
      .select("id,status")
      .eq("claimed_email_normalized", email)
      .maybeSingle();

    if (accountResult.error) {
      console.error("Staff account lookup failed", {
        code: accountResult.error.code,
      });
      return {
        status: "error",
        message: "Staff sign-in is temporarily unavailable. Please try again.",
      };
    }

    if (!accountResult.data) {
      return { status: "error", message: staffAccessMessage };
    }

    const rolesResult = await admin
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", accountResult.data.id)
      .in("role", [...staffInviteRoleValues]);

    if (rolesResult.error) {
      console.error("Staff role lookup failed", {
        code: rolesResult.error.code,
      });
      return {
        status: "error",
        message: "Staff sign-in is temporarily unavailable. Please try again.",
      };
    }

    if (
      accountResult.data.status !== "active" ||
      (rolesResult.data ?? []).length === 0
    ) {
      return { status: "error", message: staffAccessMessage };
    }

    if (!parsedPassword.success) {
      return { status: "error", message: "Enter your staff password." };
    }

    const supabase = await createClient();
    const signInResult = await supabase.auth.signInWithPassword({
      email,
      password: parsedPassword.data,
    });

    if (signInResult.error) {
      return {
        status: "error",
        message: "The email or password is incorrect.",
      };
    }

    redirect(getSafeRedirectPath(requestedNext, "/admin/events"));
  }

  try {
    const supabase = createEmailLinkClient();
    const { appUrl } = getPublicConfig();
    const callbackUrl = new URL("/auth/confirm", appUrl);
    callbackUrl.searchParams.set("next", nextPath);

    after(async () => {
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: callbackUrl.toString(),
          },
        });

        if (error) {
          console.error("Volunteer magic-link request was not delivered", {
            code: error.code,
            status: error.status,
          });
        }
      } catch (error) {
        console.error("Volunteer magic-link background delivery failed", error);
      }
    });
  } catch (error) {
    console.error("Volunteer magic-link sign-in is not configured", error);
    return {
      status: "error",
      message: "Volunteer sign-in is not configured in this environment.",
    };
  }

  return { status: "success", message: genericSuccessMessage };
}
