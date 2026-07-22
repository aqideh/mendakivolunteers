"use server";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth/staff-access";
import { getPublicConfig } from "@/lib/env";
import {
  buildPasswordSetupUrl,
  generatePasswordSetupToken,
  hashPasswordSetupToken,
  PASSWORD_SETUP_TOKEN_TTL_MS,
} from "@/lib/auth/password-setup";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const userIdSchema = z.string().uuid();

export type StaffSetupLinkState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
  link: string;
}>;

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
