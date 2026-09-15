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
});

function encode(value: string) {
  return encodeURIComponent(value);
}

export async function updateWalkInVolunteer(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = walkInEditSchema.safeParse({
    eventId,
    rosterId: formData.get("rosterId"),
    timeslotId: formData.get("timeslotId"),
    volunteerName: formData.get("volunteerName"),
    email: formData.get("email") || "",
    mobile: formData.get("mobile") || undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Walk-in details could not be saved.";
    redirect(`/admin/events/${encode(eventId)}/attendance?error=${encode(message)}`);
  }

  const attendancePath = `/admin/events/${parsed.data.eventId}/attendance`;
  const { userId } = await requireEventManager(attendancePath);
  const admin = getPhaseOneAdminClient();
  const { error } = await admin.rpc("phaseone_update_walk_in_volunteer", {
    p_event_id: parsed.data.eventId,
    p_roster_id: parsed.data.rosterId,
    p_volunteer_name: parsed.data.volunteerName,
    p_email: parsed.data.email || null,
    p_mobile: parsed.data.mobile || null,
    p_changed_by: userId,
  });

  if (error) {
    console.error("Unable to update walk-in volunteer", {
      code: error.code,
      eventId: parsed.data.eventId,
      rosterId: parsed.data.rosterId,
    });
    const message = error.code === "23505"
      ? "Those details match another volunteer on this shift. Check the roster for a duplicate entry."
      : error.message || "Walk-in details could not be saved.";
    redirect(`${attendancePath}?error=${encode(message)}`);
  }

  revalidatePath(attendancePath);
  revalidatePath(`/admin/events/${parsed.data.eventId}/insights`);

  const query = new URLSearchParams({
    timeslot: parsed.data.timeslotId,
    success: "walk_in_updated",
    highlight: parsed.data.rosterId,
  });
  redirect(`${attendancePath}?${query.toString()}#roster-${encode(parsed.data.rosterId)}`);
}
