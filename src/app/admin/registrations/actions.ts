"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const cancellationSchema = z.object({
  registrationId: z.string().uuid(),
  eventId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
});

const bulkReviewSchema = z.object({
  registrationIds: z.array(z.string().uuid()).min(1).max(100),
  decision: z.enum(["confirmed", "waitlisted", "rejected"]),
  returnTo: z.string().startsWith("/admin/registrations"),
});

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


export async function bulkReviewRegistrations(formData: FormData) {
  const parsed = bulkReviewSchema.safeParse({
    registrationIds: formData.getAll("registrationIds"),
    decision: formData.get("decision"),
    returnTo: formData.get("returnTo"),
  });

  if (!parsed.success) {
    redirect(
      "/admin/registrations?error=Bulk%20registration%20review%20details%20are%20invalid.",
    );
  }

  const { userId } = await requireEventManager(parsed.data.returnTo);
  const admin = getPhaseOneAdminClient();
  const uniqueIds = Array.from(new Set(parsed.data.registrationIds));

  const registrationsResult = await admin
    .from("keluarga_registrations")
    .select("id, event_id, status, identity_state, volunteer_id")
    .in("id", uniqueIds);

  if (registrationsResult.error || !registrationsResult.data) {
    redirect(
      parsed.data.returnTo +
        (parsed.data.returnTo.includes("?") ? "&" : "?") +
        "error=The%20selected%20registrations%20could%20not%20be%20loaded.",
    );
  }

  const selected = registrationsResult.data;
  if (selected.length !== uniqueIds.length) {
    redirect(
      parsed.data.returnTo +
        (parsed.data.returnTo.includes("?") ? "&" : "?") +
        "error=One%20or%20more%20selected%20registrations%20no%20longer%20exist.",
    );
  }

  const invalidStatus = selected.some(
    (registration) =>
      registration.status !== "pending" &&
      registration.status !== "waitlisted",
  );
  if (invalidStatus) {
    redirect(
      parsed.data.returnTo +
        (parsed.data.returnTo.includes("?") ? "&" : "?") +
        "error=One%20or%20more%20selected%20registrations%20have%20already%20been%20reviewed.",
    );
  }

  if (
    parsed.data.decision === "confirmed" &&
    selected.some(
      (registration) =>
        registration.identity_state !== "resolved" ||
        !registration.volunteer_id,
    )
  ) {
    redirect(
      parsed.data.returnTo +
        (parsed.data.returnTo.includes("?") ? "&" : "?") +
        "error=Resolve%20all%20selected%20volunteer%20identities%20before%20confirming.",
    );
  }

  let updated = 0;
  let firstError: string | null = null;

  for (const registration of selected) {
    const { error } = await admin.schema("core").rpc(
      "review_keluarga_registration",
      {
        p_registration_id: registration.id,
        p_decision: parsed.data.decision,
        p_note: null,
        p_actor_user_id: userId,
      },
    );

    if (error) {
      firstError =
        error.message.includes("full")
          ? "A selected shift became full. Review the remaining registrations before confirming."
          : error.message.includes("no longer available")
            ? "A selected shift is no longer available. Review the programme schedule first."
            : "One or more registrations could not be updated.";
      break;
    }

    updated += 1;
  }

  revalidatePath("/admin/registrations");
  for (const eventId of new Set(selected.map((registration) => registration.event_id))) {
    revalidatePath("/admin/events/" + eventId + "/edit");
    revalidatePath("/admin/events/" + eventId + "/attendance");
  }
  revalidatePath("/dashboard");
  revalidatePath("/journey");

  const separator = parsed.data.returnTo.includes("?") ? "&" : "?";
  if (firstError) {
    const message =
      updated > 0
        ? String(updated) +
          " registration(s) were updated before the next item failed. " +
          firstError
        : firstError;
    redirect(
      parsed.data.returnTo +
        separator +
        "error=" +
        encodeURIComponent(message),
    );
  }

  redirect(
    parsed.data.returnTo +
      separator +
      "success=" +
      encodeURIComponent("bulk_" + parsed.data.decision),
  );
}

export async function cancelRegistration(formData: FormData) {
  const parsed = cancellationSchema.safeParse({
    registrationId: formData.get("registrationId"),
    eventId: formData.get("eventId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirect(
      "/admin/registrations?error=Enter%20a%20cancellation%20reason.",
    );
  }

  const { userId } = await requireEventManager(
    `/admin/registrations?event=${encodeURIComponent(parsed.data.eventId)}`,
  );
  const admin = getPhaseOneAdminClient();
  const { error } = await admin.schema("core").rpc(
    "cancel_keluarga_registration",
    {
      p_registration_id: parsed.data.registrationId,
      p_reason: parsed.data.reason,
      p_actor_user_id: userId,
    },
  );

  if (error) {
    console.error("Unable to cancel KELUARGA registration", {
      code: error.code,
      registrationId: parsed.data.registrationId,
    });
    const message = error.message.includes("Attendance has already started")
      ? "Attendance has already started. Use Event Operations reconciliation instead."
      : "The registration could not be cancelled.";
    redirect(back(parsed.data.eventId, "error", message));
  }

  revalidatePath("/admin/registrations");
  revalidatePath(`/admin/events/${parsed.data.eventId}/edit`);
  revalidatePath(`/admin/events/${parsed.data.eventId}/attendance`);
  revalidatePath("/dashboard");
  revalidatePath("/journey");

  redirect(back(parsed.data.eventId, "success", "registration_cancelled"));
}
