"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import {
  eventImageBucket,
  eventImageMaxBytes,
} from "@/lib/media/storage";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const eventIdSchema = z.string().uuid();

async function getEvent(eventId: string) {
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin
    .from("phaseone_events")
    .select("id, slug, opportunity_image_url")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !data) throw new Error("Programme could not be found.");
  return data as {
    id: string;
    slug: string;
    opportunity_image_url: string | null;
  };
}

function storagePathFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${eventImageBucket}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

function revalidateEvent(eventId: string, slug: string) {
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${slug}`);
  revalidatePath(`/admin/events/${eventId}/edit`);
}

export async function requestEventImageUpload(input: {
  eventId: string;
  contentType: string;
  fileSize: number;
}) {
  const eventId = eventIdSchema.parse(input.eventId);
  if (input.contentType !== "image/webp") {
    throw new Error("Opportunity images must be prepared as WebP images.");
  }
  if (
    !Number.isSafeInteger(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > eventImageMaxBytes
  ) {
    throw new Error("Opportunity images must be 1 MB or smaller.");
  }

  await requireEventManager(`/admin/events/${eventId}/edit`);
  await getEvent(eventId);

  const storagePath = `${eventId}/${randomUUID()}.webp`;
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin.storage
    .from(eventImageBucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.token) {
    throw new Error("The opportunity image upload could not be started.");
  }

  return { storagePath, token: data.token };
}

export async function attachEventImage(input: {
  eventId: string;
  storagePath: string;
}) {
  const eventId = eventIdSchema.parse(input.eventId);
  if (
    !input.storagePath.startsWith(`${eventId}/`) ||
    !input.storagePath.endsWith(".webp")
  ) {
    throw new Error("Invalid opportunity image path.");
  }

  await requireEventManager(`/admin/events/${eventId}/edit`);
  const event = await getEvent(eventId);
  const admin = getPhaseOneAdminClient();
  const publicUrl = admin.storage
    .from(eventImageBucket)
    .getPublicUrl(input.storagePath).data.publicUrl;

  const { error } = await admin
    .from("phaseone_events")
    .update({ opportunity_image_url: publicUrl })
    .eq("id", eventId);

  if (error) {
    await admin.storage.from(eventImageBucket).remove([input.storagePath]);
    throw new Error("The image uploaded but could not be attached to the programme.");
  }

  const previousPath = storagePathFromPublicUrl(event.opportunity_image_url);
  if (previousPath && previousPath !== input.storagePath) {
    const { error: removeError } = await admin.storage
      .from(eventImageBucket)
      .remove([previousPath]);
    if (removeError) {
      console.error("Unable to remove previous opportunity image", {
        eventId,
        message: removeError.message,
      });
    }
  }

  revalidateEvent(eventId, event.slug);
  return { publicUrl };
}

export async function removeEventImage(eventIdValue: string) {
  const eventId = eventIdSchema.parse(eventIdValue);
  await requireEventManager(`/admin/events/${eventId}/edit`);
  const event = await getEvent(eventId);
  const admin = getPhaseOneAdminClient();

  const { error } = await admin
    .from("phaseone_events")
    .update({ opportunity_image_url: null })
    .eq("id", eventId);
  if (error) throw new Error("The opportunity image could not be removed.");

  const previousPath = storagePathFromPublicUrl(event.opportunity_image_url);
  if (previousPath) {
    const { error: removeError } = await admin.storage
      .from(eventImageBucket)
      .remove([previousPath]);
    if (removeError) {
      console.error("Unable to delete removed opportunity image", {
        eventId,
        message: removeError.message,
      });
    }
  }

  revalidateEvent(eventId, event.slug);
}
