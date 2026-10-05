"use server";

import type { User } from "@supabase/supabase-js";
import { z } from "zod";

import {
  internalStaffRoleValues,
  isMendakiWorkEmail,
} from "@/lib/auth/staff-roles";
import { getPublicConfig } from "@/lib/env";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);

export type StaffForgotPasswordState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

const genericSuccessMessage =
  "If this email has active Keluarga staff access, a password reset email has been sent.";

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

export async function requestStaffPasswordReset(
  _previousState: StaffForgotPasswordState,
  formData: FormData,
): Promise<StaffForgotPasswordState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) {
    return {
      status: "error",
      message: "Enter a valid MENDAKI staff email address.",
    };
  }

  const email = parsedEmail.data.toLowerCase();
  if (!isMendakiWorkEmail(email)) {
    return {
      status: "error",
      message:
        "Password reset is only available for MENDAKI staff accounts. Volunteers sign in using the verification code sent to their email.",
    };
  }

  const admin = getPhaseOneAdminClient();

  let targetUser: User | null = null;
  try {
    targetUser = await findAuthUserByEmail(email);
  } catch (error) {
    console.error("Staff password reset account lookup failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return { status: "success", message: genericSuccessMessage };
  }

  if (!targetUser) {
    return { status: "success", message: genericSuccessMessage };
  }

  const [accountResult, rolesResult] = await Promise.all([
    admin
      .schema("core")
      .from("user_accounts")
      .select("status")
      .eq("id", targetUser.id)
      .maybeSingle(),
    admin
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUser.id)
      .in("role", [...internalStaffRoleValues]),
  ]);

  if (accountResult.error || rolesResult.error) {
    console.error("Staff password reset authorization check failed", {
      accountCode: accountResult.error?.code,
      roleCode: rolesResult.error?.code,
    });
    return { status: "success", message: genericSuccessMessage };
  }

  if (
    accountResult.data?.status !== "active" ||
    (rolesResult.data ?? []).length === 0
  ) {
    return { status: "success", message: genericSuccessMessage };
  }

  const { appUrl } = getPublicConfig();
  const redirectTo = new URL("/auth/confirm", appUrl);
  redirectTo.searchParams.set("flow", "staff_recovery");
  redirectTo.searchParams.set("account", targetUser.id);

  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo.toString(),
  });

  if (error) {
    console.error("Staff password reset email could not be sent", {
      code: error.code,
      status: error.status,
    });
  }

  return { status: "success", message: genericSuccessMessage };
}


export async function validateCurrentStaffRecovery(): Promise<boolean> {
  const supabase = await createClient();
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  const user = userResult.user;

  if (
    userError ||
    !user ||
    !user.email ||
    !isMendakiWorkEmail(user.email)
  ) {
    return false;
  }

  const admin = getPhaseOneAdminClient();
  const [accountResult, rolesResult] = await Promise.all([
    admin
      .schema("core")
      .from("user_accounts")
      .select("status")
      .eq("id", user.id)
      .maybeSingle(),
    admin
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", [...internalStaffRoleValues]),
  ]);

  if (accountResult.error || rolesResult.error) {
    console.error("Staff password recovery eligibility check failed", {
      accountCode: accountResult.error?.code,
      roleCode: rolesResult.error?.code,
    });
    return false;
  }

  return (
    accountResult.data?.status === "active" &&
    (rolesResult.data ?? []).length > 0
  );
}
