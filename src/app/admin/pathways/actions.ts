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

function readId(formData: FormData, name: string): string | null {
  try {
    return readRequiredUuid(formData, name);
  } catch {
    return null;
  }
}

function revalidatePathwayRoutes() {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/pathways");
  revalidatePath("/admin/pathways");
}

export type PathwayDraftSaveState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
}>;

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

export async function savePathwayDraft(
  _previousState: PathwayDraftSaveState,
  formData: FormData,
): Promise<PathwayDraftSaveState> {
  const versionId = readId(formData, "versionId");
  if (!versionId) {
    return {
      status: "error",
      message: "Invalid pathway version identifier. Your entries have been kept on this page.",
    };
  }

  const parsed = parsePathwayDraftForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: `${getPathwayValidationMessage(parsed.error)} Correct the incomplete field and save again. Your entries have been kept.`,
    };
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
    return {
      status: "error",
      message: "The pathway draft could not be saved. Check the field values and try again. Your entries have been kept.",
    };
  }

  revalidatePathwayRoutes();
  return {
    status: "success",
    message: "Draft saved. The published pathway map is unchanged.",
  };
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
