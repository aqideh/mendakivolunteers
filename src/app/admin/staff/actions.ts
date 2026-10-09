"use server";

import type { User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/staff-access";
import {
  isMendakiWorkEmail,
  roleRequiresMendakiWorkEmail,
  staffInviteRoleValues,
} from "@/lib/auth/staff-roles";
import { getPublicConfig } from "@/lib/env";
import {
  buildPasswordSetupUrl,
  generatePasswordSetupToken,
  hashPasswordSetupToken,
  PASSWORD_SETUP_TOKEN_TTL_MS,
} from "@/lib/auth/password-setup";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const userIdSchema = z.string().uuid();
const emailSchema = z.string().trim().email().max(254);
const roleSchema = z.enum(staffInviteRoleValues);

export type StaffInviteState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

export type StaffSetupLinkState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
  link: string;
}>;

export type StaffRoleMutationResult = Readonly<
  | { ok: true; message: string }
  | { ok: false; message: string }
>;

function getStaffSetupEmailErrorMessage(errorMessage: string): string {
  if (
    errorMessage.includes("Application-specific password required") ||
    errorMessage.includes("InvalidSecondFactor")
  ) {
    return "Staff access was granted, but email delivery is blocked by the Google SMTP configuration. Update the Supabase SMTP password to a Google App Password, then use Send setup email again.";
  }

  return "Staff access was granted, but the password setup email could not be sent. Use Send setup email to try again.";
}

async function setStaffAccessLevel(
  targetUserId: string,
  role: (typeof staffInviteRoleValues)[number],
  grantedBy: string,
): Promise<StaffRoleMutationResult> {
  const admin = getPhaseOneAdminClient();

  if (roleRequiresMendakiWorkEmail(role)) {
    const userResult = await admin.auth.admin.getUserById(targetUserId);
    const targetEmail = userResult.data.user?.email ?? "";

    if (userResult.error || !isMendakiWorkEmail(targetEmail)) {
      return {
        ok: false,
        message:
          "Staff, VolTeam and Admin access require a @mendaki.org.sg work email.",
      };
    }
  }

  const { error } = await admin.schema("core").rpc("set_staff_access_level", {
    p_user_id: targetUserId,
    p_role: role,
    p_granted_by: grantedBy,
  });

  if (error) {
    console.error("Unable to set staff access level", {
      code: error.code,
      targetUserId,
      role,
    });
    const message = error.message.includes("at least one active administrator")
      ? "KELUARGA must retain at least one active Admin."
      : error.message.includes("Inactive staff accounts")
        ? "Reactivate this account before changing its access level."
        : "The staff access level could not be changed.";
    return { ok: false, message };
  }

  revalidatePath("/admin/staff");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message:
      "Keluarga access level updated. MakLom access is managed separately.",
  };
}

export async function updateStaffRole(input: {
  userId: string;
  role: string;
}): Promise<StaffRoleMutationResult> {
  const parsedUserId = userIdSchema.safeParse(input.userId);
  const parsedRole = roleSchema.safeParse(input.role);
  if (!parsedUserId.success || !parsedRole.success) {
    return { ok: false, message: "Select a valid staff account and role." };
  }

  const { userId: grantedBy } = await requireAdmin();
  return setStaffAccessLevel(parsedUserId.data, parsedRole.data, grantedBy);
}

export async function inviteStaffMember(
  _previousState: StaffInviteState,
  formData: FormData,
): Promise<StaffInviteState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  const parsedRole = roleSchema.safeParse(formData.get("role"));

  if (!parsedEmail.success) {
    return { status: "error", message: "Enter a valid staff email address." };
  }
  if (!parsedRole.success) {
    return { status: "error", message: "Select a valid staff role." };
  }

  const email = parsedEmail.data.toLowerCase();
  if (
    roleRequiresMendakiWorkEmail(parsedRole.data) &&
    !isMendakiWorkEmail(email)
  ) {
    return {
      status: "error",
      message:
        "Staff, VolTeam and Admin accounts must use a @mendaki.org.sg work email. Volunteer Leaders may use an external email.",
    };
  }

  const { userId: grantedBy } = await requireAdmin();
  const admin = getPhaseOneAdminClient();
  const { appUrl } = getPublicConfig();
  const redirectTo = new URL("/auth/confirm", appUrl);
  redirectTo.searchParams.set("next", "/staff/setup");

  let targetUser: User | null = null;
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data: userPage, error: listError } =
      await admin.auth.admin.listUsers({ page, perPage });

    if (listError) {
      console.error("Unable to check for an existing staff account", {
        code: listError.code,
        status: listError.status,
      });
      return {
        status: "error",
        message: "The staff account could not be checked. Try again.",
      };
    }

    targetUser =
      userPage.users.find(
        (user) => user.email?.trim().toLowerCase() === email,
      ) ?? null;

    if (targetUser || userPage.users.length < perPage) {
      break;
    }
  }

  let invitedNewUser = false;

  if (!targetUser) {
    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirectTo.toString(),
        data: { staff_invite: true },
      });

    if (inviteError || !inviteData.user) {
      console.error("Unable to invite staff member", {
        code: inviteError?.code,
        status: inviteError?.status,
      });
      return {
        status: "error",
        message: "The staff invitation could not be sent. Try again.",
      };
    }

    targetUser = inviteData.user;
    invitedNewUser = true;
  }

  const roleResult = await setStaffAccessLevel(
    targetUser.id,
    parsedRole.data,
    grantedBy,
  );

  if (!roleResult.ok) {
    if (invitedNewUser) {
      const rollback = await admin.auth.admin.deleteUser(targetUser.id);
      if (rollback.error) {
        console.error("Unable to roll back incomplete staff invitation", {
          code: rollback.error.code,
          status: rollback.error.status,
        });
      }
    }
    return {
      status: "error",
      message: "The invitation could not be completed. No staff access was granted.",
    };
  }

  if (!invitedNewUser) {
    const passwordSetupRedirectTo = new URL("/auth/confirm", appUrl);
    passwordSetupRedirectTo.searchParams.set("flow", "recovery");
    passwordSetupRedirectTo.searchParams.set("account", targetUser.id);
    const { error: setupEmailError } =
      await admin.auth.resetPasswordForEmail(email, {
        redirectTo: passwordSetupRedirectTo.toString(),
      });

    if (setupEmailError) {
      console.error("Unable to send setup email to existing staff account", {
        code: setupEmailError.code,
        status: setupEmailError.status,
      });
      return {
        status: "error",
        message: getStaffSetupEmailErrorMessage(setupEmailError.message),
      };
    }

    return {
      status: "success",
      message:
        "Existing account found. Keluarga access updated and a password setup email was sent. MakLom access is managed separately.",
    };
  }

  return {
    status: "success",
    message:
      "Invitation sent. The staff member can use the email link to choose a password and activate their account. MakLom access is managed separately.",
  };
}

export async function sendStaffSetupEmail(
  _previousState: StaffInviteState,
  formData: FormData,
): Promise<StaffInviteState> {
  const parsedUserId = userIdSchema.safeParse(formData.get("userId"));
  if (!parsedUserId.success) {
    return { status: "error", message: "Select a valid staff account." };
  }

  await requireAdmin();
  const admin = getPhaseOneAdminClient();
  const { data: userResult, error: userError } =
    await admin.auth.admin.getUserById(parsedUserId.data);

  if (userError || !userResult.user.email) {
    return { status: "error", message: "The setup email could not be sent." };
  }

  const { appUrl } = getPublicConfig();
  const redirectTo = new URL("/auth/confirm", appUrl);
  redirectTo.searchParams.set("flow", "recovery");
  redirectTo.searchParams.set("account", parsedUserId.data);
  const { error } = await admin.auth.resetPasswordForEmail(
    userResult.user.email,
    { redirectTo: redirectTo.toString() },
  );

  if (error) {
    return {
      status: "error",
      message: getStaffSetupEmailErrorMessage(error.message),
    };
  }

  return {
    status: "success",
    message: "Setup email sent. The link lets this staff member choose a password.",
  };
}

export async function createStaffSetupLink(
  _previousState: StaffSetupLinkState,
  formData: FormData,
): Promise<StaffSetupLinkState> {
  const parsedUserId = userIdSchema.safeParse(formData.get("userId"));
  if (!parsedUserId.success) {
    return { status: "error", message: "Select a valid staff account.", link: "" };
  }

  const { userId: createdBy } = await requireAdmin();
  const rawToken = generatePasswordSetupToken();
  const tokenHash = hashPasswordSetupToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_SETUP_TOKEN_TTL_MS).toISOString();
  const admin = getPhaseOneAdminClient();
  const { error } = await admin.schema("core").rpc(
    "issue_staff_password_setup_token",
    {
      p_user_id: parsedUserId.data,
      p_token_hash: tokenHash,
      p_created_by: createdBy,
      p_expires_at: expiresAt,
    },
  );

  if (error) {
    return {
      status: "error",
      message: "A setup link could not be created for this staff account.",
      link: "",
    };
  }

  const { appUrl } = getPublicConfig();
  return {
    status: "success",
    message: "A new one-time setup link was created. It expires in one hour.",
    link: buildPasswordSetupUrl(appUrl, rawToken),
  };
}
