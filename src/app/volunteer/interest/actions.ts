"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const applicationSchema = z.object({
  interestArea: z.enum([
    "general",
    "mentor",
    "coach",
    "facilitator",
    "specialist",
    "not_sure",
  ]),
  motivation: z.string().trim().min(10).max(2000),
  skillsExperience: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(3000).nullable(),
  ),
  availabilityNotes: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(1500).nullable(),
  ),
  referralSource: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(300).nullable(),
  ),
});

const withdrawalSchema = z.object({
  applicationId: z.string().uuid(),
});

function destination(key: "success" | "error", value: string): string {
  return `/volunteer/interest?${key}=${encodeURIComponent(value)}`;
}

export async function submitRecruitmentApplication(formData: FormData) {
  const parsed = applicationSchema.safeParse({
    interestArea: formData.get("interestArea"),
    motivation: formData.get("motivation"),
    skillsExperience: formData.get("skillsExperience"),
    availabilityNotes: formData.get("availabilityNotes"),
    referralSource: formData.get("referralSource"),
  });

  if (!parsed.success) {
    redirect(
      destination(
        "error",
        parsed.error.issues[0]?.message ?? "Check your volunteering interest form.",
      ),
    );
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) {
    redirect("/login?next=%2Fvolunteer%2Finterest");
  }

  const rpc = supabase as unknown as SupabaseClient;
  const { error } = await rpc.schema("core").rpc(
    "submit_keluarga_recruitment_application",
    {
      p_interest_area: parsed.data.interestArea,
      p_motivation: parsed.data.motivation,
      p_skills_experience: parsed.data.skillsExperience,
      p_availability_notes: parsed.data.availabilityNotes,
      p_referral_source: parsed.data.referralSource,
    },
  );

  if (error) {
    console.error("Unable to submit KELUARGA recruitment application", {
      code: error.code,
    });
    redirect(
      destination(
        "error",
        error.message.includes("not ready")
          ? "Your KELUARGA profile needs review before this form can be submitted."
          : "Your volunteering interest could not be submitted. Check the details and try again.",
      ),
    );
  }

  revalidatePath("/volunteer/interest");
  revalidatePath("/dashboard");
  revalidatePath("/admin/recruitment");
  redirect(destination("success", "application_submitted"));
}

export async function withdrawRecruitmentApplication(formData: FormData) {
  const parsed = withdrawalSchema.safeParse({
    applicationId: formData.get("applicationId"),
  });
  if (!parsed.success) {
    redirect(destination("error", "Application could not be identified."));
  }

  const supabase = await createClient();
  const rpc = supabase as unknown as SupabaseClient;
  const { error } = await rpc.schema("core").rpc(
    "withdraw_keluarga_recruitment_application",
    { p_application_id: parsed.data.applicationId },
  );

  if (error) {
    console.error("Unable to withdraw KELUARGA recruitment application", {
      code: error.code,
      applicationId: parsed.data.applicationId,
    });
    redirect(
      destination(
        "error",
        error.message.includes("no longer")
          ? "This application can no longer be withdrawn."
          : "The application could not be withdrawn.",
      ),
    );
  }

  revalidatePath("/volunteer/interest");
  revalidatePath("/admin/recruitment");
  redirect(destination("success", "application_withdrawn"));
}
