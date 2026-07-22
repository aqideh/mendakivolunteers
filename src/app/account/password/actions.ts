"use server";

import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account-access";

const currentPasswordSchema = z.string().min(1).max(128);
const newPasswordSchema = z.string().min(12).max(128);

export type PasswordChangeState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

export async function changePassword(
  _previousState: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  const currentPassword = currentPasswordSchema.safeParse(
    formData.get("currentPassword"),
  );
  const newPassword = newPasswordSchema.safeParse(formData.get("newPassword"));
  const confirmPassword = formData.get("confirmPassword");

  if (!currentPassword.success) {
    return {
      status: "error",
      message: "Enter your current password.",
    };
  }

  if (!newPassword.success) {
    return {
      status: "error",
      message: "Use a new password between 12 and 128 characters.",
    };
  }

  if (newPassword.data !== confirmPassword) {
    return {
      status: "error",
      message: "The new passwords do not match.",
    };
  }

  if (newPassword.data === currentPassword.data) {
    return {
      status: "error",
      message: "Choose a new password that differs from your current password.",
    };
  }

  const { supabase } = await requireActiveAccount("/account/password");
  const { error } = await supabase.auth.updateUser({
    password: newPassword.data,
    currentPassword: currentPassword.data,
  });

  if (error) {
    console.error("Staff password change failed", {
      code: error.code,
      status: error.status,
    });
    return {
      status: "error",
      message:
        "The password could not be changed. Check the current password and the new password requirements.",
    };
  }

  return {
    status: "success",
    message: "Your password has been changed.",
  };
}
