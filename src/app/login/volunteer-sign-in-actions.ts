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

  try {
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

    const supabase = await createClient();
    const { appUrl } = getPublicConfig();
    const emailRedirectTo = new URL("/auth/confirm", appUrl).toString();
    const options = rosterMatch
      ? {
          shouldCreateUser: true,
          emailRedirectTo,
          data: { full_name: rosterMatch.volunteer_name },
        }
      : {
          // Existing KELUARGA users can still sign in when they have no current
          // roster entry. Unknown addresses do not create an account.
          shouldCreateUser: false,
          emailRedirectTo,
        };
    const { error } = await supabase.auth.signInWithOtp({ email, options });

    // Do not expose whether the address has an existing account or roster match.
    // Delivery and eligibility failures are retained in server logs for support.
    if (error) {
      console.error("Volunteer magic-link request was not delivered", {
        code: error.code,
        status: error.status,
        rosterEligible: Boolean(rosterMatch),
      });
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
