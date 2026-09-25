"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account-access";

function optionalTrimmedText(maxLength: number) {
  return z.preprocess(
    (value) => {
      const text = typeof value === "string" ? value.trim() : "";
      return text || null;
    },
    z.string().max(maxLength).nullable(),
  );
}

function parseTags(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  mobile: z.preprocess(
    (value) => {
      const text = typeof value === "string" ? value.trim() : "";
      return text || null;
    },
    z
      .string()
      .min(7)
      .max(40)
      .regex(/^[0-9+() .-]+$/)
      .nullable(),
  ),
  bio: optionalTrimmedText(500),
  interests: z.array(z.string().min(1).max(60)).max(12),
  skills: z.array(z.string().min(1).max(60)).max(12),
  availabilityNotes: optionalTrimmedText(800),
});

export async function updateVolunteerProfile(formData: FormData) {
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    mobile: formData.get("mobile"),
    bio: formData.get("bio"),
    interests: parseTags(formData.get("interests")),
    skills: parseTags(formData.get("skills")),
    availabilityNotes: formData.get("availabilityNotes"),
  });

  if (!parsed.success) {
    redirect("/dashboard?error=profile_validation&profile=edit");
  }

  const { supabase, userId } = await requireActiveAccount(
    "/dashboard?profile=edit",
  );
  const accountClient = supabase as unknown as SupabaseClient;

  const volunteerResult = await accountClient
    .schema("core")
    .from("volunteers")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (volunteerResult.error || !volunteerResult.data) {
    console.error("Unable to resolve volunteer profile for update", {
      code: volunteerResult.error?.code,
    });
    redirect("/dashboard?error=profile_update_failed&profile=edit");
  }

  const coreResult = await accountClient
    .schema("core")
    .rpc("update_current_volunteer_profile", {
      p_display_name: parsed.data.displayName,
      p_mobile: parsed.data.mobile,
    });

  if (coreResult.error) {
    console.error("Unable to update volunteer core profile", {
      code: coreResult.error.code,
    });
    redirect("/dashboard?error=profile_update_failed&profile=edit");
  }

  const presentationResult = await accountClient
    .from("keluarga_volunteer_profiles")
    .upsert(
      {
        volunteer_id: volunteerResult.data.id,
        bio: parsed.data.bio,
        interests: parsed.data.interests,
        skills: parsed.data.skills,
        availability_notes: parsed.data.availabilityNotes,
      },
      { onConflict: "volunteer_id" },
    );

  if (presentationResult.error) {
    console.error("Unable to update KELUARGA presentation profile", {
      code: presentationResult.error.code,
    });
    redirect("/dashboard?error=profile_update_failed&profile=edit");
  }

  revalidatePath("/dashboard");
  revalidatePath("/opportunities");
  revalidatePath("/admin/registrations");
  redirect("/dashboard?success=profile_updated");
}
