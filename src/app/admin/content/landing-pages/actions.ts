"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireContentManager } from "@/lib/auth/content-access";
import {
  getLandingPageDefinition,
  landingPageKeys,
  type LandingPageKey,
} from "@/lib/content/landing-page-media";
import {
  landingPageImageBucket,
  landingPageImageMaxBytes,
} from "@/lib/media/storage";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const pageKeySchema = z.enum(landingPageKeys);

function pageRoute(key: LandingPageKey): string {
  return getLandingPageDefinition(key).href;
}

async function getLandingRecord(key: LandingPageKey) {
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin
    .schema("content")
    .from("landing_page_media")
    .select("page_key, image_url, storage_path")
    .eq("page_key", key)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Landing page photo configuration could not be found.");
  }

  return data as {
    page_key: LandingPageKey;
    image_url: string;
    storage_path: string | null;
  };
}

function revalidateLandingPage(key: LandingPageKey) {
  revalidatePath(pageRoute(key));
  revalidatePath("/admin");
  revalidatePath("/admin/content");
  revalidatePath("/admin/content/landing-pages");
}

export async function requestLandingPageImageUpload(input: {
  pageKey: LandingPageKey;
  contentType: string;
  fileSize: number;
}) {
  const pageKey = pageKeySchema.parse(input.pageKey);

  if (input.contentType !== "image/webp") {
    throw new Error("Landing page photos must be prepared as WebP images.");
  }

  if (
    !Number.isSafeInteger(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > landingPageImageMaxBytes
  ) {
    throw new Error("Landing page photos must be 1 MB or smaller.");
  }

  await requireContentManager({
    next: "/admin/content/landing-pages",
  });
  await getLandingRecord(pageKey);

  const storagePath = `${pageKey}/${randomUUID()}.webp`;
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin.storage
    .from(landingPageImageBucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.token) {
    throw new Error("The landing page photo upload could not be started.");
  }

  return { storagePath, token: data.token };
}

export async function attachLandingPageImage(input: {
  pageKey: LandingPageKey;
  storagePath: string;
}) {
  const pageKey = pageKeySchema.parse(input.pageKey);

  if (
    !input.storagePath.startsWith(`${pageKey}/`) ||
    !input.storagePath.endsWith(".webp")
  ) {
    throw new Error("Invalid landing page photo path.");
  }

  const { access } = await requireContentManager({
    next: "/admin/content/landing-pages",
  });
  const current = await getLandingRecord(pageKey);
  const admin = getPhaseOneAdminClient();
  const publicUrl = admin.storage
    .from(landingPageImageBucket)
    .getPublicUrl(input.storagePath).data.publicUrl;

  const { error } = await admin
    .schema("content")
    .from("landing_page_media")
    .update({
      image_url: publicUrl,
      storage_path: input.storagePath,
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("page_key", pageKey);

  if (error) {
    await admin.storage.from(landingPageImageBucket).remove([input.storagePath]);
    throw new Error("The photo uploaded but could not be assigned to the landing page.");
  }

  if (current.storage_path && current.storage_path !== input.storagePath) {
    const { error: removeError } = await admin.storage
      .from(landingPageImageBucket)
      .remove([current.storage_path]);

    if (removeError) {
      console.error("Unable to remove previous landing page photo", {
        pageKey,
        message: removeError.message,
      });
    }
  }

  revalidateLandingPage(pageKey);
  return { publicUrl };
}

export async function resetLandingPageImage(value: LandingPageKey) {
  const pageKey = pageKeySchema.parse(value);
  const { access } = await requireContentManager({
    next: "/admin/content/landing-pages",
  });
  const current = await getLandingRecord(pageKey);
  const definition = getLandingPageDefinition(pageKey);
  const admin = getPhaseOneAdminClient();

  const { error } = await admin
    .schema("content")
    .from("landing_page_media")
    .update({
      image_url: definition.defaultImageUrl,
      storage_path: null,
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("page_key", pageKey);

  if (error) {
    throw new Error("The landing page photo could not be reset.");
  }

  if (current.storage_path) {
    const { error: removeError } = await admin.storage
      .from(landingPageImageBucket)
      .remove([current.storage_path]);

    if (removeError) {
      console.error("Unable to remove reset landing page photo", {
        pageKey,
        message: removeError.message,
      });
    }
  }

  revalidateLandingPage(pageKey);
  return { imageUrl: definition.defaultImageUrl };
}
