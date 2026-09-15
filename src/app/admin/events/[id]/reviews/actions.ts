"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const positiveBehaviorSchema = z.enum([
  "proactive",
  "punctual",
  "reliable",
  "good_teamwork",
  "engaged",
  "takes_initiative",
  "communicates_well",
  "good_with_participants",
  "follows_instructions",
  "safety_conscious",
]);

const concernBehaviorSchema = z.enum([
  "late",
  "unreliable",
  "disengaged",
  "teamwork_concern",
  "did_not_follow_instructions",
  "inappropriate_conduct",
  "participant_interaction_concern",
  "safety_concern",
  "communication_concern",
  "left_early",
]);

const reviewSchema = z.object({
  eventId: z.string().uuid(),
  rosterId: z.string().uuid(),
  timeslotId: z.string().uuid().optional(),
  rating: z.coerce.number().int().min(1).max(5),
  positiveBehaviors: z.array(positiveBehaviorSchema).max(10),
  concernBehaviors: z.array(concernBehaviorSchema).max(10),
  comments: z.string().trim().max(2000).optional(),
  followUpRequired: z.boolean(),
});

function encode(value: string) {
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
    comments: formData.get("comments") || undefined,
    followUpRequired: formData.get("followUpRequired") === "on",
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Volunteer review could not be saved.";
    redirect(`/admin/events/${encode(eventId)}/attendance?error=${encode(message)}`);
  }

  const attendancePath = `/admin/events/${parsed.data.eventId}/attendance`;
  const { userId } = await requireEventManager(attendancePath);
  const admin = getPhaseOneAdminClient();

  const { data: roster, error: rosterError } = await admin
    .from("phaseone_roster")
    .select("id, event_id, attendance_person_key")
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
        comments: parsed.data.comments || null,
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

  const query = new URLSearchParams({
    success: "review_saved",
    highlight: parsed.data.rosterId,
  });
  if (parsed.data.timeslotId) query.set("timeslot", parsed.data.timeslotId);
  redirect(`${attendancePath}?${query.toString()}#roster-${encode(parsed.data.rosterId)}`);
}
