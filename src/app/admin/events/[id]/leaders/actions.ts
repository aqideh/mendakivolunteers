"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireProgrammeManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const assignmentSchema = z.object({
  eventId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  volunteerId: z.string().uuid().optional(),
});

function leadersPath(eventId: string) {
  return `/admin/events/${eventId}/leaders`;
}

function withMessage(path: string, key: "error" | "success", message: string) {
  return `${path}?${key}=${encodeURIComponent(message)}`;
}

export async function assignVolunteerLeader(formData: FormData) {
  const parsed = assignmentSchema.safeParse({
    eventId: formData.get("eventId"),
    userId: formData.get("userId") || undefined,
    volunteerId: formData.get("volunteerId") || undefined,
  });

  if (!parsed.success) {
    redirect("/admin/events?error=event_access_assignment_invalid");
  }

  const returnPath = leadersPath(parsed.data.eventId);
  const { userId: assignedBy } = await requireProgrammeManager(returnPath);
  const admin = getPhaseOneAdminClient();

  if (!parsed.data.volunteerId && !parsed.data.userId) {
    redirect(withMessage(returnPath, "error", "Select a volunteer."));
  }

  const { data: event, error: eventError } = await admin
    .from("phaseone_events").select("id").eq("id", parsed.data.eventId).maybeSingle();
  if (eventError || !event) {
    redirect(withMessage(returnPath, "error", "This event is unavailable."));
  }

  if (parsed.data.volunteerId) {
    const { data: volunteer, error: volunteerError } = await admin
      .schema("core").from("volunteers").select("id, auth_user_id")
      .eq("id", parsed.data.volunteerId).maybeSingle();
    if (volunteerError || !volunteer) {
      redirect(withMessage(returnPath, "error", "This volunteer could not be found."));
    }
    if (volunteer.auth_user_id) {
      const { data: account, error: accountError } = await admin
        .schema("core").from("user_accounts").select("status")
        .eq("id", volunteer.auth_user_id).maybeSingle();
      if (accountError || account?.status !== "active") {
        redirect(withMessage(returnPath, "error", "This volunteer's account is inactive."));
      }
    }
    const { error } = await admin.from("phaseone_event_volunteer_leaders")
      .upsert({
        event_id: parsed.data.eventId,
        volunteer_id: volunteer.id,
        assigned_by: assignedBy,
        assigned_at: new Date().toISOString(),
      }, { onConflict: "event_id,volunteer_id" });
    if (error) {
      console.error("Unable to assign scoped volunteer", { code: error.code });
      redirect(withMessage(returnPath, "error", "Volunteer could not be assigned."));
    }
  } else {
    const { data: account, error: accountError } = await admin.schema("core")
      .from("user_accounts").select("id, status")
      .eq("id", parsed.data.userId!).maybeSingle();
    const { data: role, error: roleError } = await admin.schema("core")
      .from("user_roles").select("user_id")
      .eq("user_id", parsed.data.userId!).eq("role", "volunteer_leader").maybeSingle();
    if (accountError || roleError || account?.status !== "active" || !role) {
      redirect(withMessage(returnPath, "error", "Select an active Volunteer Leader account."));
    }
    const { error } = await admin.from("phaseone_event_volunteer_leaders").upsert({
      event_id: parsed.data.eventId, user_id: parsed.data.userId!,
      assigned_by: assignedBy, assigned_at: new Date().toISOString(),
    }, { onConflict: "event_id,user_id" });
    if (error) redirect(withMessage(returnPath, "error", "Volunteer Leader could not be assigned."));
  }

  revalidatePath("/admin/events");
  revalidatePath(returnPath);
  redirect(withMessage(returnPath, "success", "Volunteer Leader assigned to this event."));
}

export async function removeVolunteerLeader(formData: FormData) {
  const parsed = assignmentSchema.safeParse({
    eventId: formData.get("eventId"),
    userId: formData.get("userId"),
  });

  if (!parsed.success) {
    redirect("/admin/events?error=event_access_assignment_invalid");
  }

  const returnPath = leadersPath(parsed.data.eventId);
  await requireProgrammeManager(returnPath);
  const admin = getPhaseOneAdminClient();
  const { error } = await admin
    .from("phaseone_event_volunteer_leaders")
    .delete()
    .eq("event_id", parsed.data.eventId)
    .eq(parsed.data.volunteerId ? "volunteer_id" : "user_id", (parsed.data.volunteerId ?? parsed.data.userId)!);

  if (error) {
    console.error("Unable to remove volunteer leader assignment", {
      code: error.code,
      eventId: parsed.data.eventId,
      targetUserId: parsed.data.userId,
    });
    redirect(withMessage(returnPath, "error", "Volunteer Leader assignment could not be removed."));
  }

  revalidatePath("/admin/events");
  revalidatePath(returnPath);
  redirect(withMessage(returnPath, "success", "Volunteer Leader removed from this event."));
}
