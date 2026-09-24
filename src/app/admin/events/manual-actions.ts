"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const eventSchema = z.object({
  eventId: z.string().uuid(),
});

export async function submitManualEventHoursForReview(formData: FormData) {
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
    "refresh_maklom_contribution_candidates",
    {
      p_event_id: parsed.data.eventId,
      p_actor_user_id: userId,
    },
  );

  if (error) {
    console.error("Unable to submit manual Event Operations hours for MakLom review", {
      code: error.code,
      eventId: parsed.data.eventId,
    });
    redirect(
      `/admin/events/${parsed.data.eventId}/edit?error=${encodeURIComponent(
        error.message.includes("not configured")
          ? "This event is not configured to submit contribution hours for MakLom review."
          : "Contribution-hour candidates could not be refreshed.",
      )}#roster`,
    );
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const candidates =
    typeof result.candidate_sessions === "number" ? result.candidate_sessions : 0;
  const review =
    typeof result.review_sessions === "number" ? result.review_sessions : 0;
  const skipped =
    typeof result.skipped_sessions === "number" ? result.skipped_sessions : 0;
  const minutes =
    typeof result.total_operational_minutes === "number"
      ? result.total_operational_minutes
      : 0;

  revalidatePath(`/admin/events/${parsed.data.eventId}/edit`);
  revalidatePath(`/admin/events/${parsed.data.eventId}/attendance`);
  revalidatePath("/dashboard");

  redirect(
    `/admin/events/${parsed.data.eventId}/edit?success=manual_hours_submitted&candidates=${candidates}&review=${review}&minutes=${minutes}&skipped=${skipped}#roster`,
  );
}
