"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireProgrammeManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const assignmentSchema = z.object({
  eventId: z.string().uuid(),
  userId: z.string().uuid(),
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
    userId: formData.get("userId"),
  });

  if (!parsed.success) {
    redirect("/admin/events?error=event_access_assignment_invalid");
  }

  const returnPath = leadersPath(parsed.data.eventId);
  const { userId: assignedBy } = await requireProgrammeManager(returnPath);
  const admin = getPhaseOneAdminClient();

  const [eventResult, accountResult, roleResult] = await Promise.all([
    admin
      .from("phaseone_events")
      .select("id")
      .eq("id", parsed.data.eventId)
      .maybeSingle(),
    admin
      .schema("core")
      .from("user_accounts")
      .select("id, status")
      .eq("id", parsed.data.userId)
      .maybeSingle(),
    admin
      .schema("core")
      .from("user_roles")
      .select("user_id")
      .eq("user_id", parsed.data.userId)
      .eq("role", "volunteer_leader")
      .maybeSingle(),
  ]);

  if (eventResult.error || accountResult.error || roleResult.error) {
    console.error("Unable to validate volunteer leader assignment", {
      eventCode: eventResult.error?.code,
      accountCode: accountResult.error?.code,
      roleCode: roleResult.error?.code,
      eventId: parsed.data.eventId,
      targetUserId: parsed.data.userId,
    });
    redirect(withMessage(returnPath, "error", "Volunteer Leader assignment could not be verified."));
  }

  if (!eventResult.data) {
    redirect(withMessage(returnPath, "error", "This event no longer exists."));
  }

  if (
    !accountResult.data ||
    accountResult.data.status !== "active" ||
    !roleResult.data
  ) {
    redirect(withMessage(returnPath, "error", "Select an active account with Volunteer Leader access."));
  }

  const { error } = await admin
    .from("phaseone_event_volunteer_leaders")
    .upsert(
      {
        event_id: parsed.data.eventId,
        user_id: parsed.data.userId,
        assigned_by: assignedBy,
        assigned_at: new Date().toISOString(),
      },
      { onConflict: "event_id,user_id" },
    );

  if (error) {
    console.error("Unable to assign volunteer leader", {
      code: error.code,
      eventId: parsed.data.eventId,
      targetUserId: parsed.data.userId,
    });
    redirect(withMessage(returnPath, "error", "Volunteer Leader could not be assigned."));
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
    .eq("user_id", parsed.data.userId);

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
