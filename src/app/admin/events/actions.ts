"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createPinHash } from "@/lib/phaseone/event-access";
import {
  getPhaseOneValidationMessage,
  parseEventForm,
  rosterImportSchema,
} from "@/lib/phaseone/event-validation";

function encode(value: string): string {
  return encodeURIComponent(value);
}

function eventPath(id?: string): string {
  return id ? `/admin/events/${id}/edit` : "/admin/events/new";
}

function revalidateEventRoutes(slug?: string) {
  revalidatePath("/admin/events");
  if (slug) revalidatePath(`/events/${slug}`);
}

export async function saveEvent(formData: FormData) {
  const parsed = parseEventForm(formData);
  const requestedId = typeof formData.get("id") === "string" ? String(formData.get("id")) : undefined;

  if (!parsed.success) {
    redirect(`${eventPath(requestedId)}?error=${encode(getPhaseOneValidationMessage(parsed.error))}`);
  }

  const { userId } = await requireEventManager(eventPath(parsed.data.id));
  const admin = getPhaseOneAdminClient();
  const current = parsed.data.id
    ? await admin
        .from("phaseone_events")
        .select("id, slug, pin_hash")
        .eq("id", parsed.data.id)
        .maybeSingle()
    : { data: null, error: null };

  if (current.error || (parsed.data.id && !current.data)) {
    redirect(`/admin/events?error=${encode("Event could not be found.")}`);
  }

  const willHavePin = Boolean(parsed.data.pin || (!parsed.data.clearPin && current.data?.pin_hash));
  if (
    parsed.data.isPublished &&
    (!willHavePin || !parsed.data.signInUrl || !parsed.data.signOutUrl)
  ) {
    redirect(
      `${eventPath(parsed.data.id)}?error=${encode("Published events require a PIN, sign-in URL and sign-out URL.")}`,
    );
  }

  const pinUpdate = parsed.data.pin
    ? {
        ...createPinHash(parsed.data.pin),
        updatedAt: new Date().toISOString(),
      }
    : null;

  const values = {
    external_opportunity_id: parsed.data.externalOpportunityId,
    title: parsed.data.title,
    slug: parsed.data.slug,
    reporting_at: parsed.data.reportingAt,
    venue: parsed.data.venue,
    briefing_url: parsed.data.briefingUrl,
    whatsapp_url: parsed.data.whatsappUrl,
    sign_in_url: parsed.data.signInUrl,
    sign_out_url: parsed.data.signOutUrl,
    is_published: parsed.data.isPublished,
    updated_by: userId,
    ...(pinUpdate
      ? {
          pin_salt: pinUpdate.salt,
          pin_hash: pinUpdate.hash,
          pin_updated_at: pinUpdate.updatedAt,
        }
      : parsed.data.clearPin
        ? { pin_salt: null, pin_hash: null, pin_updated_at: null }
        : {}),
  };

  if (parsed.data.id) {
    const { data, error } = await admin
      .from("phaseone_events")
      .update(values)
      .eq("id", parsed.data.id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Unable to update phase-one event", { code: error?.code });
      redirect(`${eventPath(parsed.data.id)}?error=${encode("Event could not be updated. Check the slug and URLs.")}`);
    }

    revalidateEventRoutes(current.data?.slug);
    revalidateEventRoutes(parsed.data.slug);
    redirect(`/admin/events/${parsed.data.id}/edit?success=event_updated`);
  }

  const { data, error } = await admin
    .from("phaseone_events")
    .insert({ ...values, created_by: userId })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Unable to create phase-one event", { code: error?.code });
    redirect(`/admin/events/new?error=${encode("Event could not be created. Check for a duplicate slug.")}`);
  }

  revalidateEventRoutes(parsed.data.slug);
  redirect(`/admin/events/${data.id}/edit?success=event_created`);
}

export async function importRoster(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  let rows: unknown = null;
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "null"));
  } catch {
    redirect(`/admin/events/${eventId}/edit?error=${encode("Roster data could not be read.")}`);
  }

  const parsed = rosterImportSchema.safeParse({
    eventId,
    mode: formData.get("mode"),
    fileName: formData.get("fileName"),
    rows,
  });

  if (!parsed.success) {
    redirect(
      `/admin/events/${eventId}/edit?error=${encode(getPhaseOneValidationMessage(parsed.error))}`,
    );
  }

  const { userId } = await requireEventManager(`/admin/events/${eventId}/edit`);
  const admin = getPhaseOneAdminClient();
  const { error } = await admin.rpc("phaseone_apply_roster_import", {
    p_event_id: parsed.data.eventId,
    p_mode: parsed.data.mode,
    p_file_name: parsed.data.fileName,
    p_rows: parsed.data.rows,
    p_uploaded_by: userId,
  });

  if (error) {
    console.error("Unable to import phase-one roster", { code: error.code });
    const message = error.message.includes("attendance records")
      ? "This roster cannot be replaced because attendance records already exist. Use merge instead."
      : "Roster import failed. Check duplicate IDs and required columns.";
    redirect(`/admin/events/${eventId}/edit?error=${encode(message)}`);
  }

  revalidatePath(`/admin/events/${eventId}/edit`);
  redirect(`/admin/events/${eventId}/edit?success=roster_imported`);
}
