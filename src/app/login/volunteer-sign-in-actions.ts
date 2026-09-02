"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getPublicConfig } from "@/lib/env";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { getSafeRedirectPath } from "@/lib/security/redirects";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email().max(254);

export type VolunteerSignInState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

const genericSuccessMessage =
  "If this email is linked to a KELUARGA account, approved YM Hub volunteer profile, or event roster, a sign-in link has been sent. Check your inbox and junk folder.";

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
  const nextPath = getSafeRedirectPath(
    formData.get("next")?.toString(),
    "/dashboard",
  );

  try {
    const admin = getPhaseOneAdminClient();
    const coreAdmin = admin as unknown as SupabaseClient;
    const [officialResult, rosterResult] = await Promise.all([
      coreAdmin
        .schema("core")
        .from("volunteers")
        .select("display_name")
        .eq("primary_email_normalized", email)
        .eq("account_access_eligible", true)
        .limit(2),
      admin
        .from("phaseone_roster")
        .select("volunteer_name")
        .eq("email_normalized", email)
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (officialResult.error || rosterResult.error) {
      console.error("Unable to verify volunteer email eligibility", {
        officialCode: officialResult.error?.code,
        rosterCode: rosterResult.error?.code,
      });
      return {
        status: "error",
        message: "A sign-in link could not be sent right now. Try again shortly.",
      };
    }

    const officialMatches = (officialResult.data ?? []) as {
      display_name: string | null;
    }[];
    const officialMatch =
      officialMatches.length === 1 ? officialMatches[0] : null;
    const rosterMatch = rosterResult.data;
    const shouldCreateUser = Boolean(officialMatch || rosterMatch);
    const displayName =
      officialMatch?.display_name?.trim() ||
      rosterMatch?.volunteer_name?.trim() ||
      null;

    const supabase = await createClient();
    const { appUrl } = getPublicConfig();
    const callbackUrl = new URL("/auth/confirm", appUrl);
    callbackUrl.searchParams.set("next", nextPath);
    const emailRedirectTo = callbackUrl.toString();
    const options = shouldCreateUser
      ? {
          shouldCreateUser: true,
          emailRedirectTo,
          ...(displayName ? { data: { full_name: displayName } } : {}),
        }
      : {
          // Existing KELUARGA users can still sign in when they have no current
          // roster or imported volunteer match. Unknown addresses do not create
          // an account.
          shouldCreateUser: false,
          emailRedirectTo,
        };
    const { error } = await supabase.auth.signInWithOtp({ email, options });

    // Do not expose whether the address has an existing account, official
    // volunteer record, or roster match. Delivery and eligibility failures stay
    // in server logs for support.
    if (error) {
      console.error("Volunteer magic-link request was not delivered", {
        code: error.code,
        status: error.status,
        officialEligible: Boolean(officialMatch),
        officialAmbiguous: officialMatches.length > 1,
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
