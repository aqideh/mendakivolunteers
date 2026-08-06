"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePathwayManager } from "@/lib/auth/pathway-access";
import { readRequiredUuid } from "@/lib/content/identifiers";
import {
  getPathwayValidationMessage,
  parsePathwayDraftForm,
} from "@/lib/pathways/validation";
import type { Json } from "@/types/database";

function encode(value: string): string {
  return encodeURIComponent(value);
}

function readIdOrRedirect(
  formData: FormData,
  name: string,
  message: string,
): string {
  try {
    return readRequiredUuid(formData, name);
  } catch {
    redirect(`/admin/pathways?error=${encode(message)}`);
  }
}

function revalidatePathwayRoutes() {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/pathways");
  revalidatePath("/admin/pathways");
}

export async function createPathwayDraft(formData: FormData) {
  const mapId = readIdOrRedirect(
    formData,
    "mapId",
    "Invalid pathway map identifier.",
  );
  const { supabase } = await requirePathwayManager();
  const { data, error } = await supabase
    .schema("pathways")
    .rpc("create_draft_from_active", { target_map_id: mapId });

  if (error || !data) {
    console.error("Unable to create pathway draft", {
      mapId,
      code: error?.code,
    });
    redirect(
      `/admin/pathways?error=${encode("A pathway draft could not be created.")}`,
    );
  }

  revalidatePathwayRoutes();
  redirect("/admin/pathways?success=draft_created");
}

export async function savePathwayDraft(formData: FormData) {
  const versionId = readIdOrRedirect(
    formData,
    "versionId",
    "Invalid pathway version identifier.",
  );
  const parsed = parsePathwayDraftForm(formData);

  if (!parsed.success) {
    redirect(
      `/admin/pathways?error=${encode(getPathwayValidationMessage(parsed.error))}`,
    );
  }

  const { supabase } = await requirePathwayManager();
  const payload = JSON.parse(JSON.stringify(parsed.data)) as Json;
  const { error } = await supabase.schema("pathways").rpc("save_draft", {
    draft_version_id: versionId,
    payload,
  });

  if (error) {
    console.error("Unable to save pathway draft", {
      versionId,
      code: error.code,
    });
    redirect(
      `/admin/pathways?error=${encode("The pathway draft could not be saved. Check the field values and try again.")}`,
    );
  }

  revalidatePathwayRoutes();
  redirect("/admin/pathways?success=draft_saved");
}

export async function publishPathwayDraft(formData: FormData) {
  const versionId = readIdOrRedirect(
    formData,
    "versionId",
    "Invalid pathway version identifier.",
  );
  const { supabase } = await requirePathwayManager();
  const { error } = await supabase.schema("pathways").rpc("publish_draft", {
    draft_version_id: versionId,
  });

  if (error) {
    console.error("Unable to publish pathway draft", {
      versionId,
      code: error.code,
    });
    redirect(
      `/admin/pathways?error=${encode("The pathway draft is incomplete or could not be published.")}`,
    );
  }

  revalidatePathwayRoutes();
  redirect("/admin/pathways?success=draft_published");
}
