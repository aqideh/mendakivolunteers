"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  hashPasswordSetupToken,
  isPasswordSetupToken,
} from "@/lib/auth/password-setup";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const passwordSchema = z.string().min(12).max(128);

export type SetPasswordState = Readonly<{
  status: "idle" | "error";
  message: string;
}>;

export async function setInitialPassword(
  _previousState: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const token = formData.get("token");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (!isPasswordSetupToken(token)) {
    return {
      status: "error",
      message: "This password setup link is invalid or has expired.",
    };
  }

  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success) {
    return {
      status: "error",
      message: "Use a password between 12 and 128 characters.",
    };
  }

  if (password !== confirmPassword) {
    return {
      status: "error",
      message: "The passwords do not match.",
    };
  }

  try {
    const admin = getPhaseOneAdminClient();
    const { data: userId, error: consumeError } = await admin
      .schema("core")
      .rpc("consume_staff_password_setup_token", {
        p_token_hash: hashPasswordSetupToken(token),
      });
    const parsedUserId = z.string().uuid().safeParse(userId);

    if (consumeError || !parsedUserId.success) {
      if (consumeError) {
        console.error("Unable to consume staff password setup token", {
          code: consumeError.code,
        });
      }
      return {
        status: "error",
        message: "This password setup link is invalid or has expired.",
      };
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(
      parsedUserId.data,
      { password: parsedPassword.data },
    );

    if (updateError) {
      console.error("Unable to set the staff password", {
        code: updateError.code,
        status: updateError.status,
      });
      return {
        status: "error",
        message:
          "The password could not be set. Ask an administrator for a new setup link.",
      };
    }
  } catch (error) {
    console.error("Staff password setup is not configured", error);
    return {
      status: "error",
      message: "Password setup is not configured in this environment.",
    };
  }

  redirect("/login?password=setup");
}
