"use server";

import { z } from "zod";

import { getPublicConfig, isAuthSignUpAllowed } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);

export type LoginState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

export const initialLoginState: LoginState = {
  status: "idle",
  message: "",
};

export async function requestMagicLink(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));

  if (!parsedEmail.success) {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  try {
    const supabase = await createClient();
    const { appUrl } = getPublicConfig();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsedEmail.data.toLowerCase(),
      options: {
        emailRedirectTo: `${appUrl}/auth/confirm`,
        shouldCreateUser: isAuthSignUpAllowed(),
      },
    });

    if (error) {
      console.error("Magic link request failed", {
        code: error.code,
        status: error.status,
      });
    }

    return {
      status: "success",
      message:
        "If the account is eligible, a one-time sign-in link has been sent.",
    };
  } catch (error) {
    console.error("Authentication is not configured", error);
    return {
      status: "error",
      message: "Sign-in is not configured in this environment.",
    };
  }
}
