"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const eventSchema = z.object({
  eventId: z.string().uuid(),
});

export async function creditManualEventHours(formData: FormData) {
  const parsed = eventSchema.safeParse({
    eventId: formData.get("eventId"),
  });
  if (!parsed.success) {
    redirect("/admin/events?error=Manual%20event%20could%20not%20be%20identified.");
  }

  const { userId } = await requireEventManager(
    `/admin/events/${parsed.data.eventId}/edit`,
  );
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin.schema("core").rpc(
    "refresh_manual_event_contribution_credits",
    {
      p_event_id: parsed.data.eventId,
      p_actor_user_id: userId,
    },
  );

  if (error) {
    console.error("Unable to credit manual Event Operations hours", {
      code: error.code,
      eventId: parsed.data.eventId,
    });
    redirect(
      `/admin/events/${parsed.data.eventId}/edit?error=${encodeURIComponent(
        error.message.includes("not configured")
          ? "This event is not configured for KELUARGA contribution-hour crediting."
          : "Contribution hours could not be refreshed.",
      )}#roster`,
    );
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const credited =
    typeof result.credited_sessions === "number" ? result.credited_sessions : 0;
  const skipped =
    typeof result.skipped_sessions === "number" ? result.skipped_sessions : 0;
  const hours =
    typeof result.total_hours === "number" || typeof result.total_hours === "string"
      ? String(result.total_hours)
      : "0";

  revalidatePath(`/admin/events/${parsed.data.eventId}/edit`);
  revalidatePath(`/admin/events/${parsed.data.eventId}/attendance`);
  revalidatePath("/dashboard");

  redirect(
    `/admin/events/${parsed.data.eventId}/edit?success=manual_hours_credited&credited=${credited}&hours=${encodeURIComponent(hours)}&skipped=${skipped}#roster`,
  );
}
