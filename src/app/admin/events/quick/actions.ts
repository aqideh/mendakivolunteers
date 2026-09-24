"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import {
  isValidSingaporeDateTimeLocal,
  singaporeDateTimeLocalToIso,
} from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const quickEventSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    venue: z.preprocess(
      (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
      z.string().max(240).nullable(),
    ),
    shiftLabel: z.preprocess(
      (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
      z.string().max(120).nullable(),
    ),
    startsAt: z.string().refine(isValidSingaporeDateTimeLocal),
    endsAt: z.string().refine(isValidSingaporeDateTimeLocal),
    dataScope: z.enum(["isolated", "integrated"]),
    creditHours: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      isValidSingaporeDateTimeLocal(value.startsAt) &&
      isValidSingaporeDateTimeLocal(value.endsAt) &&
      singaporeDateTimeLocalToIso(value.endsAt) <=
        singaporeDateTimeLocalToIso(value.startsAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End time must be after start time.",
      });
    }
    if (value.creditHours && value.dataScope !== "integrated") {
      context.addIssue({
        code: "custom",
        path: ["creditHours"],
        message: "Contribution-hour crediting requires database integration.",
      });
    }
  });

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "manual-event";
}

export async function createQuickEvent(formData: FormData) {
  const parsed = quickEventSchema.safeParse({
    title: formData.get("title"),
    venue: formData.get("venue"),
    shiftLabel: formData.get("shiftLabel"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    dataScope: formData.get("dataScope"),
    creditHours: formData.get("creditHours") === "on",
  });

  if (!parsed.success) {
    redirect(
      `/admin/events/quick?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Check the manual event details.",
      )}`,
    );
  }

  const { userId } = await requireEventManager("/admin/events/quick");
  const admin = getPhaseOneAdminClient();
  const startsAt = singaporeDateTimeLocalToIso(parsed.data.startsAt);
  const endsAt = singaporeDateTimeLocalToIso(parsed.data.endsAt);
  const baseSlug = slugify(
    `${parsed.data.title}-${parsed.data.startsAt.slice(0, 10)}`,
  );
  let eventId: string | null = null;
  let eventSlug: string | null = null;

  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
    const { data, error } = await admin
      .from("phaseone_events")
      .insert({
        title: parsed.data.title,
        slug,
        reporting_at: startsAt,
        venue: parsed.data.venue,
        is_published: false,
        is_opportunity_published: false,
        operations_scope:
          parsed.data.dataScope === "integrated"
            ? "manual_integrated"
            : "manual_isolated",
        credit_contribution_hours: parsed.data.creditHours,
        created_by: userId,
        updated_by: userId,
      })
      .select("id, slug")
      .single();

    if (!error && data) {
      eventId = data.id;
      eventSlug = data.slug;
      break;
    }
    if (error?.code !== "23505") {
      console.error("Unable to create manual Event Operations event", {
        code: error?.code,
      });
      redirect(
        "/admin/events/quick?error=Manual%20event%20could%20not%20be%20created.",
      );
    }
  }

  if (!eventId || !eventSlug) {
    redirect(
      "/admin/events/quick?error=Could%20not%20create%20a%20unique%20manual%20event.",
    );
  }

  const { error: scheduleError } = await admin.rpc(
    "phaseone_replace_event_timeslots",
    {
      p_event_id: eventId,
      p_timeslots: [
        {
          id: null,
          label: parsed.data.shiftLabel,
          starts_at: startsAt,
          ends_at: endsAt,
          status: "scheduled",
          sort_order: 0,
          registration_capacity: null,
        },
      ],
    },
  );

  if (scheduleError) {
    await admin.from("phaseone_events").delete().eq("id", eventId);
    console.error("Unable to create manual event shift", {
      code: scheduleError.code,
    });
    redirect(
      "/admin/events/quick?error=Manual%20event%20shift%20could%20not%20be%20created.",
    );
  }

  redirect(
    `/admin/events/${eventId}/edit?success=manual_event_created#roster`,
  );
}
