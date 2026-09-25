"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account-access";

const contactSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  mobile: z
    .string()
    .trim()
    .min(7)
    .max(40)
    .regex(/^[0-9+() .-]+$/),
});

const tagsSchema = z
  .array(z.string().trim().min(1).max(60))
  .min(1)
  .max(12);

const availabilitySlotValues = [
  "weekday_daytime",
  "weekday_evening",
  "saturday",
  "sunday",
  "ad_hoc",
] as const;

const commitmentValues = [
  "one_off",
  "monthly",
  "fortnightly",
  "weekly",
  "flexible",
] as const;

function parseTags(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

async function getVolunteerContext(next: string) {
  const { supabase, userId } = await requireActiveAccount(next);
  const client = supabase as unknown as SupabaseClient;
  const volunteerResult = await client
    .schema("core")
    .from("volunteers")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (volunteerResult.error || !volunteerResult.data) {
    redirect("/dashboard?error=profile_update_failed");
  }

  return { client, volunteerId: volunteerResult.data.id };
}

export async function saveContactStep(formData: FormData) {
  const parsed = contactSchema.safeParse({
    displayName: formData.get("displayName"),
    mobile: formData.get("mobile"),
  });

  if (!parsed.success) {
    redirect("/profile/setup?step=contact&error=validation");
  }

  const { client } = await getVolunteerContext("/profile/setup?step=contact");
  const result = await client.schema("core").rpc("update_current_volunteer_profile", {
    p_display_name: parsed.data.displayName,
    p_mobile: parsed.data.mobile,
  });

  if (result.error) {
    redirect("/profile/setup?step=contact&error=save");
  }

  revalidatePath("/dashboard");
  redirect("/profile/setup?step=interests");
}

export async function saveInterestsStep(formData: FormData) {
  const parsed = tagsSchema.safeParse(parseTags(formData.get("interests")));
  if (!parsed.success) {
    redirect("/profile/setup?step=interests&error=validation");
  }

  const { client, volunteerId } = await getVolunteerContext(
    "/profile/setup?step=interests",
  );
  const result = await client
    .from("keluarga_volunteer_profiles")
    .upsert(
      { volunteer_id: volunteerId, interests: parsed.data },
      { onConflict: "volunteer_id" },
    );

  if (result.error) {
    redirect("/profile/setup?step=interests&error=save");
  }

  revalidatePath("/dashboard");
  redirect("/profile/setup?step=skills");
}

export async function saveSkillsStep(formData: FormData) {
  const parsed = tagsSchema.safeParse(parseTags(formData.get("skills")));
  if (!parsed.success) {
    redirect("/profile/setup?step=skills&error=validation");
  }

  const { client, volunteerId } = await getVolunteerContext(
    "/profile/setup?step=skills",
  );
  const result = await client
    .from("keluarga_volunteer_profiles")
    .upsert(
      { volunteer_id: volunteerId, skills: parsed.data },
      { onConflict: "volunteer_id" },
    );

  if (result.error) {
    redirect("/profile/setup?step=skills&error=save");
  }

  revalidatePath("/dashboard");
  redirect("/profile/setup?step=availability");
}

export async function saveAvailabilityStep(formData: FormData) {
  const slots = formData
    .getAll("availabilitySlots")
    .filter((value): value is string => typeof value === "string");

  const slotsParsed = z
    .array(z.enum(availabilitySlotValues))
    .min(1)
    .max(5)
    .safeParse(slots);
  const commitmentParsed = z
    .enum(commitmentValues)
    .safeParse(formData.get("preferredCommitment"));

  if (!slotsParsed.success || !commitmentParsed.success) {
    redirect("/profile/setup?step=availability&error=validation");
  }

  const notes =
    typeof formData.get("availabilityNotes") === "string"
      ? String(formData.get("availabilityNotes")).trim().slice(0, 800) || null
      : null;

  const { client, volunteerId } = await getVolunteerContext(
    "/profile/setup?step=availability",
  );
  const result = await client
    .from("keluarga_volunteer_profiles")
    .upsert(
      {
        volunteer_id: volunteerId,
        availability_slots: slotsParsed.data,
        preferred_commitment: commitmentParsed.data,
        availability_notes: notes,
      },
      { onConflict: "volunteer_id" },
    );

  if (result.error) {
    redirect("/profile/setup?step=availability&error=save");
  }

  revalidatePath("/dashboard");
  redirect("/profile/setup?step=photo");
}

export async function saveAboutStep(formData: FormData) {
  const raw = formData.get("bio");
  const bio = typeof raw === "string" ? raw.trim().slice(0, 500) || null : null;
  const { client, volunteerId } = await getVolunteerContext(
    "/profile/setup?step=about",
  );

  const result = await client
    .from("keluarga_volunteer_profiles")
    .upsert(
      { volunteer_id: volunteerId, bio },
      { onConflict: "volunteer_id" },
    );

  if (result.error) {
    redirect("/profile/setup?step=about&error=save");
  }

  revalidatePath("/dashboard");
  redirect("/profile/setup?step=review");
}

export async function completeProfileSetup() {
  const { client, volunteerId } = await getVolunteerContext(
    "/profile/setup?step=review",
  );

  const [volunteerResult, profileResult] = await Promise.all([
    client
      .schema("core")
      .from("volunteers")
      .select("display_name, mobile")
      .eq("id", volunteerId)
      .single(),
    client
      .from("keluarga_volunteer_profiles")
      .select(
        "avatar_path, interests, skills, availability_slots, preferred_commitment",
      )
      .eq("volunteer_id", volunteerId)
      .maybeSingle(),
  ]);

  if (volunteerResult.error || profileResult.error || !profileResult.data) {
    redirect("/profile/setup?step=review&error=incomplete");
  }

  const profile = profileResult.data;
  const complete =
    Boolean(volunteerResult.data.display_name?.trim()) &&
    Boolean(volunteerResult.data.mobile?.trim()) &&
    Boolean(profile.avatar_path) &&
    (profile.interests?.length ?? 0) > 0 &&
    (profile.skills?.length ?? 0) > 0 &&
    (profile.availability_slots?.length ?? 0) > 0 &&
    Boolean(profile.preferred_commitment);

  if (!complete) {
    redirect("/profile/setup?step=review&error=incomplete");
  }

  const result = await client
    .from("keluarga_volunteer_profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("volunteer_id", volunteerId);

  if (result.error) {
    redirect("/profile/setup?step=review&error=save");
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?success=profile_updated");
}
