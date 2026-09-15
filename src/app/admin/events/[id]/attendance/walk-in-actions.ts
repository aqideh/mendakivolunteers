"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const walkInEditSchema = z.object({
  eventId: z.string().uuid(),
  rosterId: z.string().uuid(),
  timeslotId: z.string().uuid(),
  volunteerName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  mobile: z.string().trim().max(50).optional(),
  dietaryRequirements: z.string().trim().max(500).optional(),
});

function encode(value: string): string {
  return encodeURIComponent(value);
}

export async function updateWalkInVolunteerDetails(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = walkInEditSchema.safeParse({
    eventId,
    rosterId: formData.get("rosterId"),
    timeslotId: formData.get("timeslotId"),
    volunteerName: formData.get("volunteerName"),
    email: formData.get("email") || "",
    mobile: formData.get("mobile") || undefined,
    dietaryRequirements: formData.get("dietaryRequirements") || undefined,
  });

  const fallbackPath = `/admin/events/${encode(eventId)}/attendance`;
  if (!parsed.success) {
    redirect(`${fallbackPath}?error=${encode(parsed.error.issues[0]?.message ?? "Walk-in details could not be updated.")}`);
  }

  const returnPath = `/admin/events/${parsed.data.eventId}/attendance?timeslot=${encode(parsed.data.timeslotId)}`;
  await requireEventManager(returnPath);
  const admin = getPhaseOneAdminClient();

  const { data: roster, error: rosterError } = await admin
    .from("phaseone_roster")
    .select("id, entry_method, attendance_person_key")
    .eq("id", parsed.data.rosterId)
    .eq("event_id", parsed.data.eventId)
    .maybeSingle();

  if (rosterError || !roster) {
    redirect(`${returnPath}&error=${encode("Walk-in roster record could not be found.")}`);
  }
  if (roster.entry_method !== "walk_in") {
    redirect(`${returnPath}&error=${encode("Only walk-in volunteer details can be edited here.")}`);
  }

  const { data: updatedRows, error } = await admin
    .from("phaseone_roster")
    .update({
      volunteer_name: parsed.data.volunteerName,
      email: parsed.data.email || null,
      mobile: parsed.data.mobile || null,
      dietary_requirements: parsed.data.dietaryRequirements || null,
    })
    .eq("event_id", parsed.data.eventId)
    .eq("attendance_person_key", roster.attendance_person_key)
    .eq("entry_method", "walk_in")
    .select("id");

  if (error || !updatedRows || updatedRows.length === 0) {
    console.error("Unable to update walk-in volunteer details", {
      code: error?.code,
      eventId: parsed.data.eventId,
      rosterId: parsed.data.rosterId,
      attendancePersonKey: roster.attendance_person_key,
    });
    const message = error?.code === "23505"
      ? "Those corrected details match another volunteer already on this shift."
      : "Walk-in volunteer details could not be updated.";
    redirect(`${returnPath}&error=${encode(message)}`);
  }

  revalidatePath(`/admin/events/${parsed.data.eventId}/attendance`);
  revalidatePath(`/admin/events/${parsed.data.eventId}/attendance/monitor`);
  revalidatePath(`/admin/events/${parsed.data.eventId}/attendance/reconciliation`);
  revalidatePath(`/admin/events/${parsed.data.eventId}/insights`);
  redirect(`${returnPath}&success=walk_in_updated&highlight=${encode(parsed.data.rosterId)}#roster-${encode(parsed.data.rosterId)}`);
}
