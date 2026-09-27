"use server";

import { requireProgrammeManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const MAX_DRAFT_BYTES = 100_000;
const blockedKeys = new Set([
  "id",
  "signInPin",
  "signOutPin",
  "clearSignInPin",
  "clearSignOutPin",
]);

export type EventFormDraftPayload = Record<string, string | boolean | number | null | unknown[]>;

export async function saveEventFormDraft(
  payload: EventFormDraftPayload,
): Promise<{ savedAt: string } | { error: string }> {
  const { userId } = await requireProgrammeManager("/admin/events/new");

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return { error: "Draft could not be saved." };
  }

  const sanitized = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !blockedKeys.has(key)),
  );
  const encoded = JSON.stringify(sanitized);
  if (encoded.length > MAX_DRAFT_BYTES) {
    return { error: "Draft is too large to autosave." };
  }

  const savedAt = new Date().toISOString();
  const admin = getPhaseOneAdminClient();
  const { error } = await admin
    .from("phaseone_event_form_drafts")
    .upsert(
      {
        user_id: userId,
        payload: sanitized,
        updated_at: savedAt,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("Unable to autosave programme draft", { code: error.code, userId });
    return { error: "Autosave is temporarily unavailable." };
  }

  return { savedAt };
}

export async function clearEventFormDraft(): Promise<{ cleared: true } | { error: string }> {
  const { userId } = await requireProgrammeManager("/admin/events/new");
  const admin = getPhaseOneAdminClient();
  const { error } = await admin
    .from("phaseone_event_form_drafts")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("Unable to clear programme draft", { code: error.code, userId });
    return { error: "Draft could not be cleared." };
  }

  return { cleared: true };
}
