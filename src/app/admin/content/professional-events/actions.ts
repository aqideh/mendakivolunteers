"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireContentManager } from "@/lib/auth/content-access";
import { singaporeDateTimeLocalToIso } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalDateTime(formData: FormData, key: string): string | null {
  const value = textValue(formData, key);
  return value ? singaporeDateTimeLocalToIso(value) : null;
}

function parsePayload(formData: FormData) {
  const title = textValue(formData, "title");
  const summary = textValue(formData, "summary");
  const venue = textValue(formData, "venue");
  const ctaLabel = textValue(formData, "ctaLabel") || "Register";
  const ctaUrl = textValue(formData, "ctaUrl");
  const startsAt = optionalDateTime(formData, "startsAt");
  const endsAt = optionalDateTime(formData, "endsAt");
  const sortOrder = Number(textValue(formData, "sortOrder") || "0");

  if (title.length < 3 || title.length > 140) throw new Error("Enter a valid event title.");
  if (summary.length < 10 || summary.length > 600) throw new Error("Enter a valid event summary.");
  if (venue && (venue.length < 2 || venue.length > 180)) throw new Error("Enter a valid venue.");
  if (ctaLabel.length < 2 || ctaLabel.length > 40) throw new Error("Enter a valid CTA label.");
  if (ctaUrl) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(ctaUrl);
    } catch {
      throw new Error("Enter a valid CTA link.");
    }
    if (parsedUrl.protocol !== "https:") {
      throw new Error("CTA link must use HTTPS.");
    }
    if (ctaUrl.length > 2048) {
      throw new Error("CTA link is too long.");
    }
  }
  if (!Number.isInteger(sortOrder) || sortOrder < -1000 || sortOrder > 1000) {
    throw new Error("Sort order must be a whole number between -1000 and 1000.");
  }
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    throw new Error("End time cannot be before start time.");
  }

  return {
    title,
    summary,
    venue: venue || null,
    cta_label: ctaLabel,
    cta_url: ctaUrl || null,
    starts_at: startsAt,
    ends_at: endsAt,
    sort_order: sortOrder,
    is_published: formData.get("isPublished") === "on",
  };
}

function adminRedirect(message: string, kind: "success" | "error") {
  redirect(`/admin/content/professional-events?${kind}=${encodeURIComponent(message)}`);
}

function revalidateProfessionalEvents() {
  revalidatePath("/specialist");
  revalidatePath("/admin/content/professional-events");
}

export async function createProfessionalEvent(formData: FormData) {
  const { access } = await requireContentManager({
    next: "/admin/content/professional-events",
  });

  let payload;
  try {
    payload = parsePayload(formData);
  } catch (error) {
    adminRedirect(error instanceof Error ? error.message : "Event could not be saved.", "error");
  }

  const admin = getPhaseOneAdminClient();
  const { error } = await admin.schema("content").from("professional_events").insert({
    ...payload,
    created_by: access.userId,
    updated_by: access.userId,
  });

  if (error) {
    console.error("Unable to create professional event", { code: error.code });
    adminRedirect("Event could not be saved.", "error");
  }

  revalidateProfessionalEvents();
  adminRedirect("Specialist event created.", "success");
}

export async function updateProfessionalEvent(formData: FormData) {
  const { access } = await requireContentManager({
    next: "/admin/content/professional-events",
  });

  const id = textValue(formData, "id");
  if (!id) adminRedirect("Invalid event identifier.", "error");

  let payload;
  try {
    payload = parsePayload(formData);
  } catch (error) {
    adminRedirect(error instanceof Error ? error.message : "Event could not be updated.", "error");
  }

  const admin = getPhaseOneAdminClient();
  const { error } = await admin
    .schema("content")
    .from("professional_events")
    .update({
      ...payload,
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Unable to update professional event", { code: error.code, id });
    adminRedirect("Event could not be updated.", "error");
  }

  revalidateProfessionalEvents();
  adminRedirect("Specialist event updated.", "success");
}

export async function deleteProfessionalEvent(formData: FormData) {
  await requireContentManager({
    next: "/admin/content/professional-events",
  });

  const id = textValue(formData, "id");
  if (!id) adminRedirect("Invalid event identifier.", "error");

  const admin = getPhaseOneAdminClient();
  const { error } = await admin.schema("content").from("professional_events").delete().eq("id", id);

  if (error) {
    console.error("Unable to delete professional event", { code: error.code, id });
    adminRedirect("Event could not be deleted.", "error");
  }

  revalidateProfessionalEvents();
  adminRedirect("Specialist event deleted.", "success");
}
