"use server";

import { z } from "zod";

import { getPublicConfig } from "@/lib/env";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);

export type VolunteerSignInState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

const genericSuccessMessage =
  "If this email is linked to a KELUARGA account or event roster, a sign-in link has been sent. Check your inbox and junk folder.";

export async function requestVolunteerSignInLink(
  _previousState: VolunteerSignInState,
  formData: FormData,
): Promise<VolunteerSignInState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  const email = parsedEmail.data.toLowerCase();
  const admin = getPhaseOneAdminClient();
  const { data: rosterMatch, error: rosterError } = await admin
    .from("phaseone_roster")
    .select("volunteer_name")
    .eq("email_normalized", email)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rosterError) {
    console.error("Unable to verify volunteer email eligibility", {
      code: rosterError.code,
    });
    return {
      status: "error",
      message: "A sign-in link could not be sent right now. Try again shortly.",
    };
  }

  // Keep the response indistinguishable for addresses that are not yet present
  // in a controlled event roster. This avoids exposing registration membership.
  if (!rosterMatch) {
    return { status: "success", message: genericSuccessMessage };
  }

  try {
    const supabase = await createClient();
    const { appUrl } = getPublicConfig();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: new URL("/auth/confirm", appUrl).toString(),
        data: {
          full_name: rosterMatch.volunteer_name,
        },
      },
    });

    if (error) {
      console.error("Volunteer magic-link request failed", {
        code: error.code,
        status: error.status,
      });
      return {
        status: "error",
        message:
          "A sign-in link could not be sent right now. Wait a minute and try again.",
      };
    }
  } catch (error) {
    console.error("Volunteer magic-link sign-in is not configured", error);
    return {
      status: "error",
      message: "Volunteer sign-in is not configured in this environment.",
    };
  }

  return { status: "success", message: genericSuccessMessage };
}
