"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireContentManager } from "@/lib/auth/content-access";
import {
  isValidSingaporeDateTimeLocal,
  singaporeDateTimeLocalToIso,
} from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : null));

const overrideSchema = z
  .object({
    opportunityId: z.string().uuid(),
    title: z.string().trim().min(1).max(180),
    summary: optionalText(600),
    imageUrl: z
      .string()
      .trim()
      .max(2048)
      .transform((value) => (value.length > 0 ? value : null))
      .refine((value) => value === null || /^https:\/\//i.test(value), {
        message: "Image URL must use HTTPS.",
      }),
    startsAt: z.string().trim(),
    endsAt: z.string().trim(),
    scheduleText: optionalText(160),
    venue: optionalText(240),
    sortOrder: z
      .string()
      .trim()
      .transform((value) => (value.length > 0 ? Number(value) : null))
      .refine(
        (value) =>
          value === null ||
          (Number.isInteger(value) && value >= -10000 && value <= 10000),
        { message: "Sort order must be a whole number between -10000 and 10000." },
      ),
    isHidden: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.startsAt && !isValidSingaporeDateTimeLocal(value.startsAt)) {
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "Enter a valid start date and time.",
      });
    }

    if (value.endsAt && !isValidSingaporeDateTimeLocal(value.endsAt)) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "Enter a valid end date and time.",
      });
    }

    if (value.startsAt && value.endsAt) {
      const start = singaporeDateTimeLocalToIso(value.startsAt);
      const end = singaporeDateTimeLocalToIso(value.endsAt);
      if (new Date(end).getTime() < new Date(start).getTime()) {
        context.addIssue({
          code: "custom",
          path: ["endsAt"],
          message: "End date and time cannot be before the start.",
        });
      }
    }
  });

function readForm(formData: FormData) {
  return overrideSchema.safeParse({
    opportunityId: String(formData.get("opportunityId") ?? ""),
    title: String(formData.get("title") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    scheduleText: String(formData.get("scheduleText") ?? ""),
    venue: String(formData.get("venue") ?? ""),
    sortOrder: String(formData.get("sortOrder") ?? ""),
    isHidden: formData.get("isHidden") === "on",
  });
}

function errorMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the opportunity card fields.";
}

export async function saveOpportunityCardOverride(formData: FormData) {
  const parsed = readForm(formData);
  const rawId = String(formData.get("opportunityId") ?? "");
  const next = `/admin/content/opportunities/${encodeURIComponent(rawId)}/edit`;

  if (!parsed.success) {
    redirect(`${next}?error=${encodeURIComponent(errorMessage(parsed.error))}`);
  }

  const { access } = await requireContentManager({ next });
  const admin = getPhaseOneAdminClient();

  const { data: source, error: sourceError } = await admin
    .from("phaseone_external_opportunities")
    .select("id")
    .eq("id", parsed.data.opportunityId)
    .maybeSingle();

  if (sourceError || !source) {
    redirect("/admin/content?error=Opportunity%20could%20not%20be%20found.");
  }

  const startsAt = parsed.data.startsAt
    ? singaporeDateTimeLocalToIso(parsed.data.startsAt)
    : null;
  const endsAt = parsed.data.endsAt
    ? singaporeDateTimeLocalToIso(parsed.data.endsAt)
    : null;

  const { error } = await admin.from("phaseone_opportunity_overrides").upsert(
    {
      opportunity_id: parsed.data.opportunityId,
      title: parsed.data.title,
      summary: parsed.data.summary,
      image_url: parsed.data.imageUrl,
      starts_at: startsAt,
      ends_at: endsAt,
      schedule_text: parsed.data.scheduleText,
      venue: parsed.data.venue,
      is_hidden: parsed.data.isHidden,
      sort_order: parsed.data.sortOrder,
      created_by: access.userId,
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "opportunity_id" },
  );

  if (error) {
    console.error("Unable to save opportunity card override", {
      code: error.code,
      opportunityId: parsed.data.opportunityId,
    });
    redirect(`${next}?error=${encodeURIComponent("Opportunity card changes could not be saved.")}`);
  }

  revalidatePath("/opportunities");
  revalidatePath("/admin/content");
  redirect("/admin/content?success=opportunity_override_saved#opportunities");
}

export async function resetOpportunityCardOverride(formData: FormData) {
  const opportunityId = z
    .string()
    .uuid()
    .safeParse(String(formData.get("opportunityId") ?? ""));

  if (!opportunityId.success) {
    redirect("/admin/content?error=Invalid%20opportunity%20identifier.");
  }

  const next = `/admin/content/opportunities/${opportunityId.data}/edit`;
  await requireContentManager({ next });
  const admin = getPhaseOneAdminClient();

  const { error } = await admin
    .from("phaseone_opportunity_overrides")
    .delete()
    .eq("opportunity_id", opportunityId.data);

  if (error) {
    console.error("Unable to reset opportunity card override", {
      code: error.code,
      opportunityId: opportunityId.data,
    });
    redirect(`${next}?error=${encodeURIComponent("Manual changes could not be reset.")}`);
  }

  revalidatePath("/opportunities");
  revalidatePath("/admin/content");
  redirect("/admin/content?success=opportunity_override_reset#opportunities");
}
