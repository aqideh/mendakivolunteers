"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireActiveAccount } from "@/lib/auth/account-access";
import {
  profilePhotoBucket,
  profilePhotoMaxBytes,
} from "@/lib/media/storage";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

type PhotoRpcResult = Readonly<{
  previous_storage_path?: string | null;
  profile_photo_path?: string | null;
}>;

async function getCurrentVolunteer() {
  const { supabase, userId } = await requireActiveAccount("/dashboard");
  const { data, error } = await supabase
    .schema("core")
    .from("volunteers")
    .select("id, profile_photo_path")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error || !data) throw new Error("Your volunteer profile could not be found.");
  return {
    supabase,
    volunteer: data as { id: string; profile_photo_path: string | null },
  };
}

export async function requestProfilePhotoUpload(input: {
  contentType: string;
  fileSize: number;
}) {
  if (input.contentType !== "image/webp") {
    throw new Error("Profile photos must be prepared as WebP images.");
  }
  if (
    !Number.isSafeInteger(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > profilePhotoMaxBytes
  ) {
    throw new Error("Profile photos must be 500 KB or smaller.");
  }

  const { volunteer } = await getCurrentVolunteer();
  const storagePath = `${volunteer.id}/${randomUUID()}.webp`;
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin.storage
    .from(profilePhotoBucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.token) {
    throw new Error("The profile photo upload could not be started.");
  }

  return { storagePath, token: data.token };
}

export async function attachProfilePhoto(storagePath: string) {
  const { supabase, volunteer } = await getCurrentVolunteer();
  if (!storagePath.startsWith(`${volunteer.id}/`) || !storagePath.endsWith(".webp")) {
    throw new Error("Invalid profile photo path.");
  }

  const accountClient = supabase as unknown as SupabaseClient;
  const { data, error } = await accountClient
    .schema("core")
    .rpc("set_current_volunteer_profile_photo", {
      p_storage_path: storagePath,
    });

  if (error) {
    await getPhaseOneAdminClient().storage.from(profilePhotoBucket).remove([storagePath]);
    throw new Error("The profile photo uploaded but could not be attached to your profile.");
  }

  const result = (data ?? {}) as PhotoRpcResult;
  const previousPath = result.previous_storage_path;
  if (previousPath && previousPath !== storagePath) {
    const { error: removeError } = await getPhaseOneAdminClient()
      .storage
      .from(profilePhotoBucket)
      .remove([previousPath]);

    if (removeError) {
      console.error("Unable to remove previous profile photo", {
        message: removeError.message,
        volunteerId: volunteer.id,
      });
    }
  }

  revalidatePath("/dashboard");
}

export async function removeProfilePhoto() {
  const { supabase, volunteer } = await getCurrentVolunteer();
  if (!volunteer.profile_photo_path) return;

  const accountClient = supabase as unknown as SupabaseClient;
  const { error } = await accountClient
    .schema("core")
    .rpc("set_current_volunteer_profile_photo", {
      p_storage_path: null,
    });

  if (error) throw new Error("Your profile photo could not be removed.");

  const { error: removeError } = await getPhaseOneAdminClient()
    .storage
    .from(profilePhotoBucket)
    .remove([volunteer.profile_photo_path]);

  if (removeError) {
    console.error("Unable to delete removed profile photo object", {
      message: removeError.message,
      volunteerId: volunteer.id,
    });
  }

  revalidatePath("/dashboard");
}
