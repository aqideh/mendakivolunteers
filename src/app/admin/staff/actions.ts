"use server";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth/staff-access";
import {
  type StaffInviteRole,
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

async function grantStaffRole(
  userId: string,
  role: StaffInviteRole,
  grantedBy: string,
) {
  const admin = getPhaseOneAdminClient();
  return admin
    .schema("core")
    .from("user_roles")
    .upsert(
      {
        user_id: userId,
        role,
        granted_by: grantedBy,
        reason: "Staff access granted through KELUARGA administration",
      },
      { onConflict: "user_id,role" },
    );
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

  const { userId: grantedBy } = await requireAdmin();
  const admin = getPhaseOneAdminClient();
  const { appUrl } = getPublicConfig();
  const redirectTo = new URL("/auth/confirm", appUrl);
  redirectTo.searchParams.set("next", "/staff/setup");

  const { data, error } = await admin.auth.admin.inviteUserByEmail(
    parsedEmail.data.toLowerCase(),
    {
      redirectTo: redirectTo.toString(),
      data: { staff_invite: true },
    },
  );

  if (error || !data.user) {
    console.error("Unable to invite staff member", {
      code: error?.code,
      status: error?.status,
    });
    return {
      status: "error",
      message:
        "The staff invitation could not be sent. Check whether the address already has an account.",
    };
  }

  const roleResult = await grantStaffRole(
    data.user.id,
    parsedRole.data,
    grantedBy,
  );

  if (roleResult.error) {
    console.error("Unable to grant invited staff role", {
      code: roleResult.error.code,
    });
    const rollback = await admin.auth.admin.deleteUser(data.user.id);
    if (rollback.error) {
      console.error("Unable to roll back incomplete staff invitation", {
        code: rollback.error.code,
        status: rollback.error.status,
      });
    }
    return {
      status: "error",
      message:
        "The invitation could not be completed. No staff access was granted; try again.",
    };
  }

  return {
    status: "success",
    message:
      "Invitation sent. The staff member can use the email link to choose a password and activate their account.",
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
    console.error("Unable to load staff account for setup email", {
      code: userError?.code,
      status: userError?.status,
    });
    return { status: "error", message: "The setup email could not be sent." };
  }

  const { appUrl } = getPublicConfig();
  const redirectTo = new URL("/auth/confirm", appUrl);
  const { error } = await admin.auth.resetPasswordForEmail(
    userResult.user.email,
    { redirectTo: redirectTo.toString() },
  );

  if (error) {
    console.error("Unable to send staff setup email", {
      code: error.code,
      status: error.status,
    });
    return { status: "error", message: "The setup email could not be sent." };
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
    return {
      status: "error",
      message: "Select a valid staff account.",
      link: "",
    };
  }

  const { userId: createdBy } = await requireAdmin();
  const rawToken = generatePasswordSetupToken();
  const tokenHash = hashPasswordSetupToken(rawToken);
  const expiresAt = new Date(
    Date.now() + PASSWORD_SETUP_TOKEN_TTL_MS,
  ).toISOString();
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
    console.error("Unable to issue staff password setup link", {
      code: error.code,
    });
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
