"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  isProgrammeRundownMimeType,
  programmeRundownBucket,
  programmeRundownExtension,
  programmeRundownMaxFileSize,
  programmeRundownMaxImagesPerEvent,
} from "@/lib/phaseone/programme-rundown";

const eventIdSchema = z.string().uuid();
const imageIdSchema = z.string().uuid();
const fileNameSchema = z.string().trim().min(1).max(255);

async function requireExistingEvent(eventId: string) {
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin
    .from("phaseone_events")
    .select("id, slug")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !data) throw new Error("Event guide could not be found.");
  return data as { id: string; slug: string };
}

function revalidateRundown(eventId: string, slug?: string) {
  revalidatePath(`/admin/events/${eventId}/edit`);
  if (slug) revalidatePath(`/journey/${slug}`);
}

export async function requestProgrammeRundownUpload(input: {
  eventId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}) {
  const eventId = eventIdSchema.parse(input.eventId);
  const fileName = fileNameSchema.parse(input.fileName);
  if (!isProgrammeRundownMimeType(input.contentType)) {
    throw new Error("Upload a JPEG, PNG or WebP image.");
  }
  if (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0 || input.fileSize > programmeRundownMaxFileSize) {
    throw new Error("Each programme rundown image must be 5 MB or smaller.");
  }

  await requireEventManager(`/admin/events/${eventId}/edit`);
  await requireExistingEvent(eventId);
  const admin = getPhaseOneAdminClient();
  const { count, error: countError } = await admin
    .from("phaseone_event_rundown_images")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (countError) throw new Error("Programme rundown images could not be checked.");
  if ((count ?? 0) >= programmeRundownMaxImagesPerEvent) {
    throw new Error(`An event can have at most ${programmeRundownMaxImagesPerEvent} rundown images.`);
  }

  const extension = programmeRundownExtension(input.contentType);
  const storagePath = `${eventId}/${randomUUID()}.${extension}`;
  const { data, error } = await admin.storage
    .from(programmeRundownBucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.token) {
    console.error("Unable to create programme rundown upload", { code: error?.message, eventId });
    throw new Error("The image upload could not be started.");
  }

  return { storagePath, token: data.token, fileName };
}

export async function registerProgrammeRundownImage(input: {
  eventId: string;
  storagePath: string;
  fileName: string;
}) {
  const eventId = eventIdSchema.parse(input.eventId);
  const fileName = fileNameSchema.parse(input.fileName);
  if (!input.storagePath.startsWith(`${eventId}/`)) {
    throw new Error("Invalid programme rundown image path.");
  }

  await requireEventManager(`/admin/events/${eventId}/edit`);
  const event = await requireExistingEvent(eventId);
  const admin = getPhaseOneAdminClient();
  const { count, error: countError } = await admin
    .from("phaseone_event_rundown_images")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);

  if (countError) throw new Error("Programme rundown images could not be checked.");
  if ((count ?? 0) >= programmeRundownMaxImagesPerEvent) {
    await admin.storage.from(programmeRundownBucket).remove([input.storagePath]);
    throw new Error(`An event can have at most ${programmeRundownMaxImagesPerEvent} rundown images.`);
  }

  const { error } = await admin.from("phaseone_event_rundown_images").insert({
    event_id: eventId,
    storage_path: input.storagePath,
    original_file_name: fileName,
    sort_order: count ?? 0,
  });

  if (error) {
    await admin.storage.from(programmeRundownBucket).remove([input.storagePath]);
    console.error("Unable to register programme rundown image", { code: error.code, eventId });
    throw new Error("The image uploaded but could not be attached to the event.");
  }

  revalidateRundown(eventId, event.slug);
}

export async function deleteProgrammeRundownImage(imageIdValue: string) {
  const imageId = imageIdSchema.parse(imageIdValue);
  const admin = getPhaseOneAdminClient();
  const { data: image, error } = await admin
    .from("phaseone_event_rundown_images")
    .select("id, event_id, storage_path")
    .eq("id", imageId)
    .maybeSingle();

  if (error || !image) throw new Error("Programme rundown image could not be found.");
  const eventId = String(image.event_id);
  await requireEventManager(`/admin/events/${eventId}/edit`);
  const event = await requireExistingEvent(eventId);

  const { error: deleteError } = await admin
    .from("phaseone_event_rundown_images")
    .delete()
    .eq("id", imageId);
  if (deleteError) throw new Error("Programme rundown image could not be removed.");

  const { count } = await admin
    .from("phaseone_event_rundown_images")
    .select("id", { count: "exact", head: true })
    .eq("storage_path", image.storage_path);
  if ((count ?? 0) === 0) {
    const { error: storageError } = await admin.storage
      .from(programmeRundownBucket)
      .remove([String(image.storage_path)]);
    if (storageError) {
      console.error("Unable to delete unreferenced rundown object", {
        message: storageError.message,
        imageId,
      });
    }
  }

  revalidateRundown(eventId, event.slug);
}

export async function moveProgrammeRundownImage(
  imageIdValue: string,
  direction: "up" | "down",
) {
  const imageId = imageIdSchema.parse(imageIdValue);
  const admin = getPhaseOneAdminClient();
  const { data: selected, error: selectedError } = await admin
    .from("phaseone_event_rundown_images")
    .select("id, event_id")
    .eq("id", imageId)
    .maybeSingle();
  if (selectedError || !selected) throw new Error("Programme rundown image could not be found.");

  const eventId = String(selected.event_id);
  await requireEventManager(`/admin/events/${eventId}/edit`);
  const event = await requireExistingEvent(eventId);
  const { data: images, error } = await admin
    .from("phaseone_event_rundown_images")
    .select("id, sort_order, created_at")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !images) throw new Error("Programme rundown images could not be reordered.");

  const currentIndex = images.findIndex((image) => image.id === imageId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= images.length) return;

  const current = images[currentIndex]!;
  const target = images[targetIndex]!;
  const [first, second] = await Promise.all([
    admin.from("phaseone_event_rundown_images").update({ sort_order: target.sort_order }).eq("id", current.id),
    admin.from("phaseone_event_rundown_images").update({ sort_order: current.sort_order }).eq("id", target.id),
  ]);
  if (first.error || second.error) throw new Error("Programme rundown images could not be reordered.");

  revalidateRundown(eventId, event.slug);
}
