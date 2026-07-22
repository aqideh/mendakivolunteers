"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSafeRedirectPath } from "@/lib/security/redirects";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(1).max(128);

export type LoginState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

export async function signInWithPassword(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  const parsedPassword = passwordSchema.safeParse(formData.get("password"));

  if (!parsedEmail.success) {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  if (!parsedPassword.success) {
    return {
      status: "error",
      message: "Enter your password.",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsedEmail.data.toLowerCase(),
      password: parsedPassword.data,
    });

    if (error) {
      console.error("Password sign-in failed", {
        code: error.code,
        status: error.status,
      });

      return {
        status: "error",
        message: "Invalid email address or password.",
      };
    }
  } catch (error) {
    console.error("Authentication is not configured", error);
    return {
      status: "error",
      message: "Sign-in is not configured in this environment.",
    };
  }

  redirect(getSafeRedirectPath(formData.get("next")?.toString()));
}
