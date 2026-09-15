"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  concernBehaviorValues,
  positiveBehaviorValues,
} from "@/lib/phaseone/volunteer-reviews";

const positiveBehaviorSchema = z.enum(positiveBehaviorValues as [string, ...string[]]);
const concernBehaviorSchema = z.enum(concernBehaviorValues as [string, ...string[]]);

const reviewSchema = z.object({
  eventId: z.string().uuid(),
  rosterId: z.string().uuid(),
  timeslotId: z.string().uuid().optional(),
  rating: z.coerce.number().int().min(1).max(5),
  positiveBehaviors: z.array(positiveBehaviorSchema).max(positiveBehaviorValues.length),
  concernBehaviors: z.array(concernBehaviorSchema).max(concernBehaviorValues.length),
  comment: z.string().trim().max(1500).optional(),
  followUpRequired: z.boolean(),
});

function encode(value: string): string {
  return encodeURIComponent(value);
}

export async function saveVolunteerReview(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = reviewSchema.safeParse({
    eventId,
    rosterId: formData.get("rosterId"),
    timeslotId: formData.get("timeslotId") || undefined,
    rating: formData.get("rating"),
    positiveBehaviors: formData.getAll("positiveBehaviors"),
    concernBehaviors: formData.getAll("concernBehaviors"),
    comment: formData.get("comment") || undefined,
    followUpRequired: formData.get("followUpRequired") === "on",
  });

  const fallbackPath = `/admin/events/${encode(eventId)}/attendance`;
  if (!parsed.success) {
    redirect(`${fallbackPath}?error=${encode(parsed.error.issues[0]?.message ?? "Review could not be saved.")}`);
  }

  const attendancePath = `/admin/events/${parsed.data.eventId}/attendance`;
  const { userId } = await requireEventManager(attendancePath);
  const admin = getPhaseOneAdminClient();

  const { data: roster, error: rosterError } = await admin
    .from("phaseone_roster")
    .select("id, event_id, timeslot_id, attendance_person_key")
    .eq("id", parsed.data.rosterId)
    .eq("event_id", parsed.data.eventId)
    .maybeSingle();

  if (rosterError || !roster) {
    redirect(`${attendancePath}?error=${encode("Volunteer roster record could not be found.")}`);
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("phaseone_volunteer_reviews")
    .upsert(
      {
        event_id: parsed.data.eventId,
        roster_id: parsed.data.rosterId,
        volunteer_person_key: roster.attendance_person_key,
        rating: parsed.data.rating,
        positive_behaviors: parsed.data.positiveBehaviors,
        concern_behaviors: parsed.data.concernBehaviors,
        comment: parsed.data.comment || null,
        follow_up_required: parsed.data.followUpRequired,
        reviewed_by: userId,
        reviewed_at: now,
        updated_at: now,
      },
      { onConflict: "event_id,volunteer_person_key,reviewed_by" },
    );

  if (error) {
    console.error("Unable to save volunteer review", {
      code: error.code,
      eventId: parsed.data.eventId,
      rosterId: parsed.data.rosterId,
    });
    redirect(`${attendancePath}?error=${encode("Volunteer review could not be saved.")}`);
  }

  revalidatePath(attendancePath);
  revalidatePath(`/admin/events/${parsed.data.eventId}/insights`);

  const returnTimeslotId = parsed.data.timeslotId ?? roster.timeslot_id;
  const query = new URLSearchParams({
    success: "review_saved",
    highlight: parsed.data.rosterId,
  });
  if (returnTimeslotId) query.set("timeslot", returnTimeslotId);
  redirect(`${attendancePath}?${query.toString()}#roster-${encode(parsed.data.rosterId)}`);
}
