"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const categorySchema = z.enum([
  "skill",
  "interest",
  "experience",
  "connection",
  "role_preference",
  "availability",
  "language",
  "development",
  "follow_up",
  "note",
]);

const sourceSchema = z.enum(["volunteer_shared", "staff_observed"]);

const captureSchema = z.object({
  eventId: z.string().uuid(),
  rosterId: z.string().uuid(),
  timeslotId: z.string().uuid().optional(),
  category: categorySchema,
  value: z.string().trim().min(1).max(240),
  detail: z.string().trim().max(1500).optional(),
  sourceType: sourceSchema,
});

const reviewSchema = z.object({
  eventId: z.string().uuid(),
  insightId: z.string().uuid(),
  decision: z.enum(["accepted", "dismissed"]),
});

function encode(value: string) {
  return encodeURIComponent(value);
}

export async function addVolunteerInsight(formData: FormData) {
  const parsed = captureSchema.safeParse({
    eventId: formData.get("eventId"),
    rosterId: formData.get("rosterId"),
    timeslotId: formData.get("timeslotId") || undefined,
    category: formData.get("category"),
    value: formData.get("value"),
    detail: formData.get("detail") || undefined,
    sourceType: formData.get("sourceType"),
  });

  if (!parsed.success) {
    const eventId = String(formData.get("eventId") ?? "");
    redirect(`/admin/events/${encode(eventId)}/attendance?error=${encode(parsed.error.issues[0]?.message ?? "Insight could not be saved.")}`);
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

  const { error } = await admin.from("phaseone_volunteer_insights").insert({
    event_id: parsed.data.eventId,
    roster_id: parsed.data.rosterId,
    timeslot_id: parsed.data.timeslotId ?? roster.timeslot_id,
    volunteer_person_key: roster.attendance_person_key,
    category: parsed.data.category,
    value: parsed.data.value,
    detail: parsed.data.detail || null,
    source_type: parsed.data.sourceType,
    review_status: "submitted",
    captured_by: userId,
  });

  if (error) {
    console.error("Unable to save volunteer insight", { code: error.code, eventId: parsed.data.eventId });
    redirect(`${attendancePath}?error=${encode("Volunteer insight could not be saved.")}`);
  }

  revalidatePath(attendancePath);
  revalidatePath(`/admin/events/${parsed.data.eventId}/insights`);
  redirect(`${attendancePath}?success=insight_saved&highlight=${encode(parsed.data.rosterId)}`);
}

export async function reviewVolunteerInsight(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    eventId: formData.get("eventId"),
    insightId: formData.get("insightId"),
    decision: formData.get("decision"),
  });

  if (!parsed.success) {
    throw new Error("Insight review action could not be read.");
  }

  const reviewPath = `/admin/events/${parsed.data.eventId}/insights`;
  const { userId } = await requireEventManager(reviewPath);
  const admin = getPhaseOneAdminClient();

  const { error } = await admin
    .from("phaseone_volunteer_insights")
    .update({
      review_status: parsed.data.decision,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.insightId)
    .eq("event_id", parsed.data.eventId)
    .eq("review_status", "submitted");

  if (error) {
    console.error("Unable to review volunteer insight", { code: error.code, insightId: parsed.data.insightId });
    throw new Error("Volunteer insight could not be reviewed.");
  }

  revalidatePath(reviewPath);
}
