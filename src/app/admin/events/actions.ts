"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  buildPackagePinUpdate,
  getPackagePublishError,
  packageWillHaveActionPins,
} from "@/lib/phaseone/package-cms";
import {
  getPhaseOneValidationMessage,
  parseEventForm,
  rosterImportSchema,
  type EventFormInput,
} from "@/lib/phaseone/event-validation";

function encode(value: string): string {
  return encodeURIComponent(value);
}

function eventPath(id?: string): string {
  return id ? `/admin/events/${id}/edit` : "/admin/events/new";
}

function revalidateEventRoutes(slug?: string) {
  revalidatePath("/admin/events");
  revalidatePath("/admin/content");
  revalidatePath("/journey");
  if (slug) {
    revalidatePath(`/journey/${slug}`);
  }
}

function timeslotPayload(timeslots: EventFormInput["timeslots"]) {
  return timeslots.map((timeslot, index) => ({
    id: timeslot.id ?? null,
    label: timeslot.label,
    starts_at: timeslot.startsAt,
    ends_at: timeslot.endsAt,
    status: timeslot.status,
    sort_order: index,
  }));
}

export async function duplicateEvent(formData: FormData) {
  const sourceId = String(formData.get("eventId") ?? "").trim();
  if (!sourceId) {
    redirect(`/admin/events?error=${encode("Select an event guide to duplicate.")}`);
  }

  const { userId } = await requireEventManager("/admin/events");
  const admin = getPhaseOneAdminClient();
  const [eventResult, timeslotsResult, rundownImagesResult] = await Promise.all([
    admin
      .from("phaseone_events")
      .select(
        "id, external_opportunity_id, title, slug, venue, navigation_destination, attire_notes, preparation_notes, programme_rundown_url, briefing_url, briefing_available_at, whatsapp_url, sign_in_url, sign_out_url",
      )
      .eq("id", sourceId)
      .maybeSingle(),
    admin
      .from("phaseone_event_timeslots")
      .select("label, starts_at, ends_at, status, sort_order")
      .eq("event_id", sourceId)
      .order("starts_at", { ascending: true })
      .order("sort_order", { ascending: true }),
    admin
      .from("phaseone_event_rundown_images")
      .select("storage_path, original_file_name, sort_order")
      .eq("event_id", sourceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (eventResult.error || timeslotsResult.error || rundownImagesResult.error) {
    console.error("Unable to load event guide for duplication", {
      eventCode: eventResult.error?.code,
      timeslotsCode: timeslotsResult.error?.code,
      rundownCode: rundownImagesResult.error?.code,
      sourceId,
    });
    redirect(`/admin/events?error=${encode("Event guide could not be duplicated.")}`);
  }
  if (!eventResult.data) {
    redirect(`/admin/events?error=${encode("Event guide could not be found.")}`);
  }
  if (!timeslotsResult.data || timeslotsResult.data.length === 0) {
    redirect(
      `/admin/events/${sourceId}/edit?error=${encode("Add at least one reporting time before duplicating this event guide.")}`,
    );
  }

  const source = eventResult.data;
  const firstTimeslot = timeslotsResult.data.at(0)!;
  const baseSlug = `${source.slug}-copy`;
  let created: { id: string; slug: string } | null = null;
  let createErrorCode: string | undefined;

  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
    const { data, error } = await admin
      .from("phaseone_events")
      .insert({
        external_opportunity_id: source.external_opportunity_id,
        title: `${source.title} (Copy)`,
        slug,
        reporting_at: firstTimeslot.starts_at,
        venue: source.venue,
        navigation_destination: source.navigation_destination,
        attire_notes: source.attire_notes,
        preparation_notes: source.preparation_notes,
        programme_rundown_url: source.programme_rundown_url,
        briefing_url: source.briefing_url,
        briefing_available_at: source.briefing_available_at,
        whatsapp_url: source.whatsapp_url,
        sign_in_url: source.sign_in_url,
        sign_out_url: source.sign_out_url,
        is_published: false,
        created_by: userId,
        updated_by: userId,
      })
      .select("id, slug")
      .single();

    if (!error && data) {
      created = data;
      break;
    }

    createErrorCode = error?.code;
    if (error?.code !== "23505") {
      break;
    }
  }

  if (!created) {
    console.error("Unable to create duplicated event guide", {
      code: createErrorCode,
      sourceId,
    });
    redirect(
      `/admin/events?error=${encode("Event guide could not be duplicated. Check its linked opportunity and try again.")}`,
    );
  }

  const duplicateSchedule = timeslotsResult.data.map((timeslot, index) => ({
    id: null,
    label: timeslot.label,
    starts_at: timeslot.starts_at,
    ends_at: timeslot.ends_at,
    status: timeslot.status,
    sort_order: index,
  }));
  const { error: scheduleError } = await admin.rpc(
    "phaseone_replace_event_timeslots",
    {
      p_event_id: created.id,
      p_timeslots: duplicateSchedule,
    },
  );

  if (scheduleError) {
    await admin.from("phaseone_events").delete().eq("id", created.id);
    console.error("Unable to duplicate event guide schedule", {
      code: scheduleError.code,
      sourceId,
      duplicateId: created.id,
    });
    redirect(
      `/admin/events/${sourceId}/edit?error=${encode("The event guide could not be duplicated because its reporting times could not be copied.")}`,
    );
  }

  if (rundownImagesResult.data && rundownImagesResult.data.length > 0) {
    const { error: rundownError } = await admin
      .from("phaseone_event_rundown_images")
      .insert(
        rundownImagesResult.data.map((image, index) => ({
          event_id: created.id,
          storage_path: image.storage_path,
          original_file_name: image.original_file_name,
          sort_order: index,
        })),
      );

    if (rundownError) {
      await admin.from("phaseone_events").delete().eq("id", created.id);
      console.error("Unable to duplicate programme rundown images", {
        code: rundownError.code,
        sourceId,
        duplicateId: created.id,
      });
      redirect(
        `/admin/events/${sourceId}/edit?error=${encode("The journey could not be duplicated because its programme rundown images could not be copied.")}`,
      );
    }
  }

  revalidateEventRoutes(source.slug);
  revalidateEventRoutes(created.slug);
  redirect(`/admin/events/${created.id}/edit?success=event_duplicated`);
}

export type EventSaveResult = Readonly<{
  status: "error";
  message: string;
  eventId?: string;
}>;

function eventSaveError(message: string, eventId?: string): EventSaveResult {
  return eventId ? { status: "error", message, eventId } : { status: "error", message };
}

export async function saveEvent(formData: FormData): Promise<EventSaveResult> {
  const parsed = parseEventForm(formData);
  const requestedId =
    typeof formData.get("id") === "string" ? String(formData.get("id")) : undefined;

  if (!parsed.success) {
    return eventSaveError(
      `${getPhaseOneValidationMessage(parsed.error)} Correct the field and save again. Your entries have been kept.`,
      requestedId,
    );
  }

  const { userId } = await requireEventManager(eventPath(parsed.data.id));
  const admin = getPhaseOneAdminClient();
  const current = parsed.data.id
    ? await admin
        .from("phaseone_events")
        .select("id, slug, is_published, sign_in_pin_hash, sign_out_pin_hash")
        .eq("id", parsed.data.id)
        .maybeSingle()
    : { data: null, error: null };

  if (current.error || (parsed.data.id && !current.data)) {
    console.error("Unable to load event guide before save", {
      code: current.error?.code,
      eventId: parsed.data.id,
    });
    return eventSaveError(
      "The event guide could not be loaded for saving. Your entries have been kept; try again.",
      parsed.data.id,
    );
  }

  const pinInput = {
    signInPin: parsed.data.signInPin,
    clearSignInPin: parsed.data.clearSignInPin,
    signOutPin: parsed.data.signOutPin,
    clearSignOutPin: parsed.data.clearSignOutPin,
  };
  const pins = packageWillHaveActionPins(current.data, pinInput);
  const publishError = getPackagePublishError({
    isPublished: parsed.data.isPublished,
    timeslots: parsed.data.timeslots,
    venue: parsed.data.venue,
    navigationDestination: parsed.data.navigationDestination,
    briefingUrl: parsed.data.briefingUrl,
    briefingAvailableAt: parsed.data.briefingAvailableAt,
    signInUrl: parsed.data.signInUrl,
    signOutUrl: parsed.data.signOutUrl,
    hasSignInPin: pins.signIn,
    hasSignOutPin: pins.signOut,
  });
  if (publishError) {
    return eventSaveError(`${publishError} Your entries have been kept.`, parsed.data.id);
  }

  const firstTimeslot = parsed.data.timeslots.at(0);
  if (!firstTimeslot) {
    return eventSaveError("At least one timeslot is required. Your entries have been kept.", parsed.data.id);
  }

  const pinUpdate = buildPackagePinUpdate(pinInput);
  const values = {
    external_opportunity_id: parsed.data.externalOpportunityId,
    title: parsed.data.title,
    slug: parsed.data.slug,
    reporting_at: firstTimeslot.startsAt,
    venue: parsed.data.venue,
    navigation_destination: parsed.data.navigationDestination,
    attire_notes: parsed.data.attireNotes,
    preparation_notes: parsed.data.preparationNotes,
    programme_rundown_url: parsed.data.programmeRundownUrl,
    briefing_url: parsed.data.briefingUrl,
    briefing_available_at: parsed.data.briefingAvailableAt,
    whatsapp_url: parsed.data.whatsappUrl,
    sign_in_url: parsed.data.signInUrl,
    sign_out_url: parsed.data.signOutUrl,
    is_published: parsed.data.isPublished,
    updated_by: userId,
    ...pinUpdate,
  };
  const schedule = timeslotPayload(parsed.data.timeslots);

  if (parsed.data.id) {
    const demotingToDraft = Boolean(
      current.data?.is_published && !parsed.data.isPublished,
    );

    if (demotingToDraft) {
      const { error } = await admin
        .from("phaseone_events")
        .update(values)
        .eq("id", parsed.data.id);
      if (error) {
        console.error("Unable to update event guide", { code: error.code });
        return eventSaveError(
          "Event guide could not be updated. Check the slug, schedule and URLs, then try again. Your entries have been kept.",
          parsed.data.id,
        );
      }
    }

    const { error: scheduleError } = await admin.rpc(
      "phaseone_replace_event_timeslots",
      { p_event_id: parsed.data.id, p_timeslots: schedule },
    );
    if (scheduleError) {
      console.error("Unable to update event guide schedule", {
        code: scheduleError.code,
      });
      return eventSaveError(
        "Event guide schedule could not be updated. Correct the schedule and try again. Your entries have been kept.",
        parsed.data.id,
      );
    }

    if (!demotingToDraft) {
      const { data, error } = await admin
        .from("phaseone_events")
        .update(values)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle();

      if (error || !data) {
        console.error("Unable to update event guide", { code: error?.code });
        return eventSaveError(
          "Event guide could not be updated. Check the slug, schedule and URLs, then try again. Your entries have been kept.",
          parsed.data.id,
        );
      }
    }

    revalidateEventRoutes(current.data?.slug);
    revalidateEventRoutes(parsed.data.slug);
    redirect(`/admin/events/${parsed.data.id}/edit?success=event_updated`);
  }

  const { data: created, error: createError } = await admin
    .from("phaseone_events")
    .insert({
      external_opportunity_id: parsed.data.externalOpportunityId,
      title: parsed.data.title,
      slug: parsed.data.slug,
      reporting_at: firstTimeslot.startsAt,
      venue: parsed.data.venue,
      navigation_destination: parsed.data.navigationDestination,
      attire_notes: parsed.data.attireNotes,
      preparation_notes: parsed.data.preparationNotes,
      programme_rundown_url: parsed.data.programmeRundownUrl,
      briefing_url: parsed.data.briefingUrl,
      briefing_available_at: parsed.data.briefingAvailableAt,
      whatsapp_url: parsed.data.whatsappUrl,
      sign_in_url: parsed.data.signInUrl,
      sign_out_url: parsed.data.signOutUrl,
      is_published: false,
      updated_by: userId,
      created_by: userId,
    })
    .select("id")
    .single();

  if (createError || !created) {
    console.error("Unable to create event guide", { code: createError?.code });
    return eventSaveError(
      "Event guide could not be created. Check for a duplicate slug and try again. Your entries have been kept.",
    );
  }

  const { error: scheduleError } = await admin.rpc(
    "phaseone_replace_event_timeslots",
    { p_event_id: created.id, p_timeslots: schedule },
  );
  if (scheduleError) {
    console.error("Unable to configure new event guide schedule", {
      code: scheduleError.code,
      eventId: created.id,
    });
    return eventSaveError(
      "The journey draft was created, but its schedule could not be saved. Your entries have been kept; correct the schedule and save again.",
      created.id,
    );
  }

  const { error: configureError } = await admin
    .from("phaseone_events")
    .update({ ...pinUpdate, is_published: parsed.data.isPublished })
    .eq("id", created.id);

  if (configureError) {
    console.error("Unable to configure new event guide", {
      code: configureError.code,
      eventId: created.id,
    });
    return eventSaveError(
      "The journey draft was created, but its attendance or publication settings could not be saved. Your entries have been kept; save again to retry.",
      created.id,
    );
  }

  revalidateEventRoutes(parsed.data.slug);
  redirect(`/admin/events/${created.id}/edit?success=event_created`);
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
