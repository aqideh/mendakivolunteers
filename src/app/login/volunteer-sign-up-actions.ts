"use server";

import { z } from "zod";

import { getPublicConfig } from "@/lib/env";
import { getSafeRedirectPath } from "@/lib/security/redirects";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);

export type VolunteerSignUpState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

const genericSuccessMessage =
  "If the email can receive messages, a KELUARGA account link has been sent. Open it to verify your email and finish creating your account.";

export async function requestVolunteerSignUpLink(
  _previousState: VolunteerSignUpState,
  formData: FormData,
): Promise<VolunteerSignUpState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const email = parsedEmail.data.toLowerCase();
  const nextPath = getSafeRedirectPath(
    formData.get("next")?.toString(),
    "/dashboard",
  );

  try {
    const supabase = await createClient();
    const { appUrl } = getPublicConfig();
    const callbackUrl = new URL("/auth/confirm", appUrl);
    callbackUrl.searchParams.set("next", nextPath);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      console.error("Volunteer sign-up link request was not delivered", {
        code: error.code,
        status: error.status,
      });
    }
  } catch (error) {
    console.error("Volunteer sign-up is not configured", error);
    return {
      status: "error",
      message: "Volunteer sign-up is not configured in this environment.",
    };
  }

  return { status: "success", message: genericSuccessMessage };
}
