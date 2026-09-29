"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const sizes = ["S", "M", "L", "XL", "2XL", "3XL", "5XL", "7XL"] as const;
const types = ["round_neck", "collared"] as const;

export async function issueVolunteerShirt(formData: FormData) {
  const parsed = z.object({
    eventId: z.string().uuid(),
    volunteerId: z.string().uuid(),
    timeslotId: z.string().uuid().optional().or(z.literal("")),
    shirtType: z.enum(types),
    size: z.enum(sizes),
  }).safeParse({
    eventId: formData.get("eventId"),
    volunteerId: formData.get("volunteerId"),
    timeslotId: formData.get("timeslotId"),
    shirtType: formData.get("shirtType"),
    size: formData.get("size"),
  });

  if (!parsed.success) {
    redirect("/dashboard?error=event_access_denied");
  }

  const back = `/admin/events/${parsed.data.eventId}/attendance${parsed.data.timeslotId ? `?timeslot=${encodeURIComponent(parsed.data.timeslotId)}` : ""}`;
  const { userId } = await requireEventManager(back);
  const admin = getPhaseOneAdminClient();

  const result = await admin.rpc("server_issue_volunteer_shirt", {
    p_actor_user_id: userId,
    p_volunteer_id: parsed.data.volunteerId,
    p_shirt_type: parsed.data.shirtType,
    p_size: parsed.data.size,
    p_event_id: parsed.data.eventId,
    p_note: null,
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
  redirect(`${back}${back.includes("?") ? "&" : "?"}success=shirt_issued`);
}
