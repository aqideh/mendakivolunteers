"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const reviewSchema = z.object({
  registrationId: z.string().uuid(),
  eventId: z.string().uuid(),
  decision: z.enum(["confirmed", "waitlisted", "rejected"]),
  note: z.preprocess(
    (value) => {
      const text = typeof value === "string" ? value.trim() : "";
      return text || null;
    },
    z.string().max(1000).nullable(),
  ),
});

function back(eventId: string, key: "success" | "error", value: string) {
  return `/admin/registrations?event=${encodeURIComponent(eventId)}&${key}=${encodeURIComponent(value)}`;
}

export async function reviewRegistration(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    registrationId: formData.get("registrationId"),
    eventId: formData.get("eventId"),
    decision: formData.get("decision"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    redirect(
      "/admin/registrations?error=Registration%20review%20details%20are%20invalid.",
    );
  }

  const { userId } = await requireEventManager(
    `/admin/registrations?event=${encodeURIComponent(parsed.data.eventId)}`,
  );
  const admin = getPhaseOneAdminClient();
  const { error } = await admin.schema("core").rpc("review_keluarga_registration", {
    p_registration_id: parsed.data.registrationId,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note,
    p_actor_user_id: userId,
  });

  if (error) {
    console.error("Unable to review KELUARGA registration", {
      code: error.code,
      registrationId: parsed.data.registrationId,
    });
    const message = error.message.includes("full")
      ? "A selected shift is full. Use Waitlist instead."
      : error.message.includes("no longer available")
        ? "A selected shift is no longer available. Review the programme schedule first."
        : "The registration could not be updated.";
    redirect(back(parsed.data.eventId, "error", message));
  }

  revalidatePath("/admin/registrations");
  revalidatePath(`/admin/events/${parsed.data.eventId}/edit`);
  revalidatePath(`/admin/events/${parsed.data.eventId}/attendance`);
  revalidatePath("/dashboard");
  revalidatePath("/journey");

  redirect(
    back(
      parsed.data.eventId,
      "success",
      `registration_${parsed.data.decision}`,
    ),
  );
}
