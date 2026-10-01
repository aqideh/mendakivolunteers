"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager, requireProgrammeManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const sizes = ["S", "M", "L", "XL", "2XL", "3XL", "5XL", "7XL"] as const;
const types = ["round_neck", "collared"] as const;
const collectionMethods = ["issued_now", "already_collected"] as const;
const additionalIssueReasons = [
  "replacement_damaged",
  "replacement_lost",
  "different_shirt_type",
  "programme_requirement",
  "new_allocation_cycle",
  "other",
] as const;

export async function issueVolunteerShirt(formData: FormData) {
  const parsed = z.object({
    eventId: z.string().uuid(),
    volunteerId: z.string().uuid(),
    timeslotId: z.string().uuid().optional().or(z.literal("")),
    shirtType: z.enum(types),
    actualSize: z.enum(sizes),
    preferredSize: z.enum(sizes).optional().or(z.literal("")),
    collectionMethod: z.enum(collectionMethods),
  }).safeParse({
    eventId: formData.get("eventId"),
    volunteerId: formData.get("volunteerId"),
    timeslotId: formData.get("timeslotId"),
    shirtType: formData.get("shirtType"),
    actualSize: formData.get("actualSize"),
    preferredSize: formData.get("preferredSize"),
    collectionMethod: formData.get("collectionMethod"),
  });

  if (!parsed.success) {
    redirect("/dashboard?error=event_access_denied");
  }

  const back = `/admin/events/${parsed.data.eventId}/attendance${parsed.data.timeslotId ? `?timeslot=${encodeURIComponent(parsed.data.timeslotId)}` : ""}`;
  const { userId } = await requireEventManager(back);
  const admin = getPhaseOneAdminClient();

  const result = await admin.rpc("server_record_volunteer_shirt", {
    p_actor_user_id: userId,
    p_volunteer_id: parsed.data.volunteerId,
    p_shirt_type: parsed.data.shirtType,
    p_actual_size: parsed.data.actualSize,
    p_collection_method: parsed.data.collectionMethod,
    p_event_id: parsed.data.eventId,
    p_preferred_size: parsed.data.preferredSize || null,
    p_note:
      parsed.data.preferredSize && parsed.data.preferredSize !== parsed.data.actualSize
        ? `Preferred size ${parsed.data.preferredSize}; recorded actual size ${parsed.data.actualSize}.`
        : null,
  });

  if (result.error) {
    const errorCode =
      result.error.code === "23505"
        ? "shirt_already_issued"
        : result.error.message.includes("out of stock")
          ? "shirt_out_of_stock"
          : "shirt_issue_failed";
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${errorCode}`);
  }

  revalidatePath(`/admin/events/${parsed.data.eventId}/attendance`);
  revalidatePath("/admin/inventory/shirts");
  const successCode =
    parsed.data.collectionMethod === "already_collected"
      ? "shirt_already_collected"
      : "shirt_issued";
  redirect(`${back}${back.includes("?") ? "&" : "?"}success=${successCode}`);
}


export async function issueAdditionalVolunteerShirt(formData: FormData) {
  const parsed = z.object({
    eventId: z.string().uuid(),
    volunteerId: z.string().uuid(),
    timeslotId: z.string().uuid().optional().or(z.literal("")),
    shirtType: z.enum(types),
    actualSize: z.enum(sizes),
    preferredSize: z.enum(sizes).optional().or(z.literal("")),
    issueReason: z.enum(additionalIssueReasons),
    note: z.string().max(1000).optional().or(z.literal("")),
  }).safeParse({
    eventId: formData.get("eventId"),
    volunteerId: formData.get("volunteerId"),
    timeslotId: formData.get("timeslotId"),
    shirtType: formData.get("shirtType"),
    actualSize: formData.get("actualSize"),
    preferredSize: formData.get("preferredSize"),
    issueReason: formData.get("issueReason"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    redirect("/dashboard?error=event_access_denied");
  }

  const back = `/admin/events/${parsed.data.eventId}/attendance${parsed.data.timeslotId ? `?timeslot=${encodeURIComponent(parsed.data.timeslotId)}` : ""}`;
  const { userId } = await requireProgrammeManager(back);
  const admin = getPhaseOneAdminClient();

  const result = await admin.rpc("server_issue_additional_volunteer_shirt", {
    p_actor_user_id: userId,
    p_volunteer_id: parsed.data.volunteerId,
    p_shirt_type: parsed.data.shirtType,
    p_actual_size: parsed.data.actualSize,
    p_issue_reason: parsed.data.issueReason,
    p_event_id: parsed.data.eventId,
    p_preferred_size: parsed.data.preferredSize || null,
    p_note: parsed.data.note?.trim() || null,
  });

  if (result.error) {
    const errorCode = result.error.message.includes("out of stock")
      ? "shirt_out_of_stock"
      : result.error.message.includes("initial shirt record")
        ? "shirt_initial_required"
        : result.error.message.includes("short explanation")
          ? "shirt_reason_details_required"
          : "shirt_issue_failed";
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${errorCode}`);
  }

  revalidatePath(`/admin/events/${parsed.data.eventId}/attendance`);
  revalidatePath("/admin/inventory/shirts");
  redirect(`${back}${back.includes("?") ? "&" : "?"}success=shirt_additional_issued`);
}
