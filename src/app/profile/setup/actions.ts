"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account-access";
import { OneMapConfigurationError, resolveSingaporePostalCode } from "@/lib/onemap/server";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { findHighConfidenceIdentityCandidates } from "@/lib/volunteers/reconciliation-candidates";

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

const shirtSizes = ["S", "M", "L", "XL", "2XL", "3XL", "5XL", "7XL"] as const;

const qualificationValues = [
  "primary",
  "secondary",
  "n_level",
  "o_level",
  "a_level",
  "ite",
  "diploma",
  "professional_certificate",
  "bachelors",
  "postgraduate",
  "other",
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

function optionalText(value: FormDataEntryValue | null, max: number) {
  if (typeof value !== "string") return null;
  const clean = value.trim().slice(0, max);
  return clean || null;
}

function editMode(formData: FormData) {
  return formData.get("mode") === "edit";
}

function stepRedirect(step: string, isEdit: boolean, success?: string): never {
  if (isEdit) {
    const suffix = success ? `?success=${encodeURIComponent(success)}` : "";
    redirect(`/profile/edit${suffix}`);
  }
  redirect(`/profile/setup?step=${step}`);
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

  return { client, volunteerId: volunteerResult.data.id, userId };
}

async function upsertPrivateDetails(
  client: SupabaseClient,
  volunteerId: string,
  values: Record<string, unknown>,
) {
  const updateResult = await client
    .from("volunteer_private_details")
    .update(values)
    .eq("volunteer_id", volunteerId)
    .select("volunteer_id")
    .maybeSingle();

  if (updateResult.error || updateResult.data) {
    return updateResult;
  }

  return client
    .from("volunteer_private_details")
    .insert({ volunteer_id: volunteerId, ...values });
}

function refreshProfilePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/profile/edit");
  revalidatePath("/profile/setup");
}

export async function saveContactStep(formData: FormData) {
  const isEdit = editMode(formData);
  const parsed = contactSchema.safeParse({
    displayName: formData.get("displayName"),
    mobile: formData.get("mobile"),
  });

  if (!parsed.success) {
    redirect(`/profile/setup?step=contact&error=validation${isEdit ? "&mode=edit" : ""}`);
  }

  const { client } = await getVolunteerContext("/profile/setup?step=contact");
  const result = await client.schema("core").rpc("update_current_volunteer_profile", {
    p_display_name: parsed.data.displayName,
    p_mobile: parsed.data.mobile,
  });

  if (result.error) {
    redirect(`/profile/setup?step=contact&error=save${isEdit ? "&mode=edit" : ""}`);
  }

  refreshProfilePaths();
  stepRedirect("home", isEdit, "contact");
}

export async function saveHomeStep(formData: FormData) {
  const isEdit = editMode(formData);
  const parsed = z.object({
    postalCode: z.string().trim().regex(/^[0-9]{6}$/),
  }).safeParse({
    postalCode: formData.get("postalCode"),
  });

  if (!parsed.success) {
    redirect(`/profile/setup?step=home&error=validation${isEdit ? "&mode=edit" : ""}`);
  }

  const { client } = await getVolunteerContext("/profile/setup?step=home");

  let verifiedLocation;
  try {
    verifiedLocation = await resolveSingaporePostalCode(parsed.data.postalCode);
  } catch (error) {
    console.error("Unable to verify volunteer home location with OneMap", {
      message: error instanceof Error ? error.message : "Unknown OneMap error",
      kind: error instanceof OneMapConfigurationError ? "configuration" : "lookup",
    });

    const code =
      error instanceof OneMapConfigurationError
        ? "location_service_unavailable"
        : "location_lookup";

    redirect(`/profile/setup?step=home&error=${code}${isEdit ? "&mode=edit" : ""}`);
  }

  const result = await client.rpc("update_current_volunteer_home_location", {
    p_postal_code: verifiedLocation.postalCode,
    p_address_line: verifiedLocation.normalizedAddress,
    p_latitude: verifiedLocation.latitude,
    p_longitude: verifiedLocation.longitude,
    p_planning_area: verifiedLocation.planningArea,
  });

  if (result.error) {
    console.error("Unable to save verified volunteer home location", {
      code: result.error.code,
    });
    redirect(`/profile/setup?step=home&error=save${isEdit ? "&mode=edit" : ""}`);
  }

  refreshProfilePaths();
  stepRedirect("personal", isEdit, "home");
}

export async function savePersonalStep(formData: FormData) {
  const isEdit = editMode(formData);
  const dateString = typeof formData.get("dateOfBirth") === "string"
    ? String(formData.get("dateOfBirth"))
    : "";
  const parsed = z.string().date().safeParse(dateString);

  if (!parsed.success) {
    redirect(`/profile/setup?step=personal&error=validation${isEdit ? "&mode=edit" : ""}`);
  }

  const date = new Date(`${parsed.data}T00:00:00Z`);
  const today = new Date();
  if (
    Number.isNaN(date.getTime()) ||
    date > today ||
    date < new Date("1900-01-01T00:00:00Z")
  ) {
    redirect(`/profile/setup?step=personal&error=validation${isEdit ? "&mode=edit" : ""}`);
  }

  const languages = tagsSchema.safeParse(parseTags(formData.get("languagesSpoken")));
  const emergencyContact = z
    .object({
      name: z.string().trim().min(1).max(160),
      mobile: z
        .string()
        .trim()
        .min(7)
        .max(40)
        .regex(/^[0-9+() .-]+$/),
    })
    .safeParse({
      name: formData.get("emergencyContactName"),
      mobile: formData.get("emergencyContactMobile"),
    });

  if (!languages.success || !emergencyContact.success) {
    redirect(`/profile/setup?step=personal&error=validation${isEdit ? "&mode=edit" : ""}`);
  }

  const { client, volunteerId } = await getVolunteerContext("/profile/setup?step=personal");
  const result = await upsertPrivateDetails(client, volunteerId, {
    date_of_birth: parsed.data,
    languages_spoken: languages.data,
    emergency_contact_name: emergencyContact.data.name,
    emergency_contact_mobile: emergencyContact.data.mobile,
  });

  if (result.error) {
    redirect(`/profile/setup?step=personal&error=save${isEdit ? "&mode=edit" : ""}`);
  }

  refreshProfilePaths();
  stepRedirect("interests", isEdit, "personal");
}

export async function saveInterestsStep(formData: FormData) {
  const isEdit = editMode(formData);
  const parsed = tagsSchema.safeParse(parseTags(formData.get("interests")));
  if (!parsed.success) {
    redirect(`/profile/setup?step=interests&error=validation${isEdit ? "&mode=edit" : ""}`);
  }

  const { client, volunteerId } = await getVolunteerContext("/profile/setup?step=interests");
  const result = await client
    .from("keluarga_volunteer_profiles")
    .upsert(
      { volunteer_id: volunteerId, interests: parsed.data },
      { onConflict: "volunteer_id" },
    );

  if (result.error) {
    redirect(`/profile/setup?step=interests&error=save${isEdit ? "&mode=edit" : ""}`);
  }

  refreshProfilePaths();
  stepRedirect("skills", isEdit, "interests");
}

export async function saveSkillsStep(formData: FormData) {
  const isEdit = editMode(formData);
  const parsed = tagsSchema.safeParse(parseTags(formData.get("skills")));
  if (!parsed.success) {
    redirect(`/profile/setup?step=skills&error=validation${isEdit ? "&mode=edit" : ""}`);
  }

  const { client, volunteerId } = await getVolunteerContext("/profile/setup?step=skills");
  const result = await client
    .from("keluarga_volunteer_profiles")
    .upsert(
      { volunteer_id: volunteerId, skills: parsed.data },
      { onConflict: "volunteer_id" },
    );

  if (result.error) {
    redirect(`/profile/setup?step=skills&error=save${isEdit ? "&mode=edit" : ""}`);
  }

  refreshProfilePaths();
  stepRedirect("availability", isEdit, "skills");
}

export async function saveAvailabilityStep(formData: FormData) {
  const isEdit = editMode(formData);
  const slots = formData
    .getAll("availabilitySlots")
    .filter((value): value is string => typeof value === "string");

  const slotsParsed = z.array(z.enum(availabilitySlotValues)).min(1).max(5).safeParse(slots);
  const commitmentParsed = z.enum(commitmentValues).safeParse(formData.get("preferredCommitment"));

  if (!slotsParsed.success || !commitmentParsed.success) {
    redirect(`/profile/setup?step=availability&error=validation${isEdit ? "&mode=edit" : ""}`);
  }

  const { client, volunteerId } = await getVolunteerContext("/profile/setup?step=availability");
  const result = await client
    .from("keluarga_volunteer_profiles")
    .upsert(
      {
        volunteer_id: volunteerId,
        availability_slots: slotsParsed.data,
        preferred_commitment: commitmentParsed.data,
        availability_notes: optionalText(formData.get("availabilityNotes"), 800),
      },
      { onConflict: "volunteer_id" },
    );

  if (result.error) {
    redirect(`/profile/setup?step=availability&error=save${isEdit ? "&mode=edit" : ""}`);
  }

  refreshProfilePaths();
  stepRedirect("event-readiness", isEdit, "availability");
}

export async function saveEventReadinessStep(formData: FormData) {
  const isEdit = editMode(formData);
  const shirtSize = z.enum(shirtSizes).safeParse(formData.get("tshirtSize"));
  const noKnownAllergies = formData.get("noKnownFoodAllergies") === "on";
  const foodAllergies = optionalText(formData.get("foodAllergies"), 800);
  const dietaryRequirements = optionalText(formData.get("dietaryRequirements"), 800);

  if (!shirtSize.success || (!noKnownAllergies && !foodAllergies)) {
    redirect(`/profile/setup?step=event-readiness&error=validation${isEdit ? "&mode=edit" : ""}`);
  }

  const { client, volunteerId } = await getVolunteerContext("/profile/setup?step=event-readiness");
  const result = await upsertPrivateDetails(client, volunteerId, {
    tshirt_size: shirtSize.data,
    dietary_requirements: dietaryRequirements,
    no_known_food_allergies: noKnownAllergies,
    food_allergies: noKnownAllergies ? null : foodAllergies,
  });

  if (result.error) {
    redirect(`/profile/setup?step=event-readiness&error=save${isEdit ? "&mode=edit" : ""}`);
  }

  refreshProfilePaths();
  stepRedirect("education", isEdit, "event-readiness");
}

export async function saveEducationStep(formData: FormData) {
  const isEdit = editMode(formData);
  const qualification = z.enum(qualificationValues).safeParse(formData.get("highestQualification"));
  const institution = optionalText(formData.get("institution"), 200);
  const fieldOfStudy = optionalText(formData.get("fieldOfStudy"), 200);

  const fieldOfStudyRequired =
    qualification.success &&
    ["ite", "diploma", "bachelors", "postgraduate"].includes(qualification.data);

  if (
    !qualification.success ||
    !institution ||
    (fieldOfStudyRequired && !fieldOfStudy)
  ) {
    redirect(`/profile/setup?step=education&error=validation${isEdit ? "&mode=edit" : ""}`);
  }

  const { client, volunteerId } = await getVolunteerContext("/profile/setup?step=education");
  const result = await upsertPrivateDetails(client, volunteerId, {
    highest_qualification: qualification.data,
    institution,
    field_of_study: fieldOfStudy,
  });

  if (result.error) {
    redirect(`/profile/setup?step=education&error=save${isEdit ? "&mode=edit" : ""}`);
  }

  refreshProfilePaths();
  stepRedirect("photo", isEdit, "education");
}

export async function savePhotoVisibilityStep(formData: FormData) {
  const isEdit = editMode(formData);
  const { client, volunteerId } = await getVolunteerContext("/profile/setup?step=photo");
  const result = await client
    .from("keluarga_volunteer_profiles")
    .upsert(
      {
        volunteer_id: volunteerId,
        event_card_photo_opt_in: formData.get("eventCardPhotoOptIn") === "on",
      },
      { onConflict: "volunteer_id" },
    );

  if (result.error) {
    redirect(`/profile/setup?step=photo&error=save${isEdit ? "&mode=edit" : ""}`);
  }

  refreshProfilePaths();
  revalidatePath("/opportunities");
  stepRedirect("about", isEdit, "photo");
}

export async function saveAboutStep(formData: FormData) {
  const isEdit = editMode(formData);
  const bio = optionalText(formData.get("bio"), 500);
  const { client, volunteerId } = await getVolunteerContext("/profile/setup?step=about");

  const result = await client
    .from("keluarga_volunteer_profiles")
    .upsert(
      { volunteer_id: volunteerId, bio },
      { onConflict: "volunteer_id" },
    );

  if (result.error) {
    redirect(`/profile/setup?step=about&error=save${isEdit ? "&mode=edit" : ""}`);
  }

  refreshProfilePaths();
  stepRedirect("review", isEdit, "about");
}

export async function completeProfileSetup() {
  const { client, volunteerId, userId } = await getVolunteerContext("/profile/setup?step=review");

  const [volunteerResult, profileResult, privateResult] = await Promise.all([
    client
      .schema("core")
      .from("volunteers")
      .select("display_name, mobile")
      .eq("id", volunteerId)
      .single(),
    client
      .from("keluarga_volunteer_profiles")
      .select("avatar_path, interests, skills, availability_slots, preferred_commitment")
      .eq("volunteer_id", volunteerId)
      .maybeSingle(),
    client
      .from("volunteer_private_details")
      .select(
        "date_of_birth, postal_code, address_line, tshirt_size, food_allergies, no_known_food_allergies, highest_qualification, institution, field_of_study, languages_spoken, emergency_contact_name, emergency_contact_mobile",
      )
      .eq("volunteer_id", volunteerId)
      .maybeSingle(),
  ]);

  if (
    volunteerResult.error ||
    profileResult.error ||
    privateResult.error ||
    !profileResult.data ||
    !privateResult.data
  ) {
    redirect("/profile/setup?step=review&error=incomplete");
  }

  const privateDetails = privateResult.data;
  const complete =
    Boolean(volunteerResult.data.display_name?.trim()) &&
    Boolean(volunteerResult.data.mobile?.trim()) &&
    Boolean(profileResult.data.avatar_path) &&
    (profileResult.data.interests?.length ?? 0) > 0 &&
    (profileResult.data.skills?.length ?? 0) > 0 &&
    (profileResult.data.availability_slots?.length ?? 0) > 0 &&
    Boolean(profileResult.data.preferred_commitment) &&
    Boolean(privateDetails.date_of_birth) &&
    (privateDetails.languages_spoken?.length ?? 0) > 0 &&
    Boolean(privateDetails.emergency_contact_name?.trim()) &&
    Boolean(privateDetails.emergency_contact_mobile?.trim()) &&
    Boolean(privateDetails.postal_code) &&
    Boolean(privateDetails.address_line) &&
    Boolean(privateDetails.tshirt_size) &&
    (privateDetails.no_known_food_allergies || Boolean(privateDetails.food_allergies?.trim())) &&
    Boolean(privateDetails.highest_qualification) &&
    Boolean(privateDetails.institution?.trim()) &&
    (!["ite", "diploma", "bachelors", "postgraduate"].includes(
      privateDetails.highest_qualification ?? "",
    ) ||
      Boolean(privateDetails.field_of_study?.trim()));

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

  const admin = getPhaseOneAdminClient();
  const now = new Date().toISOString();

  const [accountResult, candidatePoolResult] = await Promise.all([
    admin
      .schema("core")
      .from("user_accounts")
      .select("claimed_email_normalized, email_ownership_verified")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .schema("core")
      .from("volunteers")
      .select("id, display_name, mobile, primary_email_normalized")
      .neq("id", volunteerId)
      .limit(5000),
  ]);

  if (
    !accountResult.error &&
    !candidatePoolResult.error &&
    accountResult.data?.email_ownership_verified
  ) {
    const candidates = findHighConfidenceIdentityCandidates(
      {
        displayName: volunteerResult.data.display_name,
        mobile: volunteerResult.data.mobile,
        email: accountResult.data.claimed_email_normalized,
      },
      candidatePoolResult.data ?? [],
    );

    if (candidates.length > 0) {
      const existingCase = await admin
        .schema("core")
        .from("account_link_cases")
        .select("id")
        .eq("auth_user_id", userId)
        .in("status", ["pending", "needs_review"])
        .maybeSingle();

      if (!existingCase.error) {
        const values = {
          status: "needs_review",
          reason_code:
            candidates.length === 1
              ? "verified_name_mobile_match"
              : "ambiguous_name_mobile_match",
          candidate_volunteer_id:
            candidates.length === 1 ? (candidates[0]?.id ?? null) : null,
          review_outcome: null,
          requested_sections: [],
          volunteer_message: null,
          submitted_for_review_at: now,
          resolved_by: null,
          resolved_at: null,
        };

        if (existingCase.data) {
          await admin
            .schema("core")
            .from("account_link_cases")
            .update(values)
            .eq("id", existingCase.data.id);
        } else {
          await admin
            .schema("core")
            .from("account_link_cases")
            .insert({ auth_user_id: userId, ...values });
        }
      }
    }
  }
  const reviewResult = await admin
    .schema("core")
    .from("account_link_cases")
    .update({
      status: "pending",
      reason_code: "temporary_unverified_email",
      review_outcome: null,
      requested_sections: [],
      volunteer_message: null,
      submitted_for_review_at: now,
      resolved_by: null,
      resolved_at: null,
    })
    .eq("auth_user_id", userId)
    .in("status", ["pending", "needs_review"])
    .eq("reason_code", "temporary_unverified_email");

  if (reviewResult.error) {
    console.error("Unable to submit temporary volunteer profile for review", {
      code: reviewResult.error.code,
    });
  }

  refreshProfilePaths();
  revalidatePath("/admin/reconciliation");
  revalidatePath("/admin");
  redirect("/dashboard?success=profile_updated");
}
