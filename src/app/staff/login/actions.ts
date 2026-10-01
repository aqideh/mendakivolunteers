"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { staffInviteRoleValues } from "@/lib/auth/staff-roles";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { getSafeRedirectPath } from "@/lib/security/redirects";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(1).max(128);

export type StaffLoginState = Readonly<{
  status: "idle" | "error";
  message: string;
}>;

export async function signInStaffWithPassword(
  _previousState: StaffLoginState,
  formData: FormData,
): Promise<StaffLoginState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  const parsedPassword = passwordSchema.safeParse(formData.get("password"));

  if (!parsedEmail.success) {
    return { status: "error", message: "Enter a valid staff email address." };
  }

  if (!parsedPassword.success) {
    return { status: "error", message: "Enter your password." };
  }

  const supabase = await createClient();
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: parsedEmail.data.toLowerCase(),
      password: parsedPassword.data,
    });

  if (signInError || !signInData.user) {
    console.error("Staff password sign-in failed", {
      code: signInError?.code,
      status: signInError?.status,
    });
    return {
      status: "error",
      message: "Invalid staff email address or password.",
    };
  }

  const admin = getPhaseOneAdminClient();
  const [accountResult, rolesResult] = await Promise.all([
    admin
      .schema("core")
      .from("user_accounts")
      .select("status")
      .eq("id", signInData.user.id)
      .maybeSingle(),
    admin
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", signInData.user.id)
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
      message: "Staff access could not be verified. Try again.",
    };
  }

  const hasStaffAccess = (rolesResult.data ?? []).length > 0;
  if (accountResult.data?.status !== "active" || !hasStaffAccess) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message:
        "This account is not an active staff account. Ask a Keluarga Admin to check your access.",
    };
  }

  redirect(
    getSafeRedirectPath(formData.get("next")?.toString(), "/admin/events"),
  );
}
