"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireContentManager } from "@/lib/auth/content-access";
import { readRequiredUuid } from "@/lib/content/identifiers";
import { getValidationMessage } from "@/lib/content/validation";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { parseOpportunityOverrideForm } from "@/lib/phaseone/opportunity-override-validation";

function encode(value: string): string {
  return encodeURIComponent(value);
}

function getId(formData: FormData): string {
  try {
    return readRequiredUuid(formData, "id");
  } catch {
    redirect("/admin/content?error=Invalid%20opportunity%20identifier.");
  }
}

function revalidateOpportunityRoutes() {
  revalidatePath("/opportunities");
  revalidatePath("/admin/content");
}

export async function updateOpportunityOverride(formData: FormData) {
  const id = getId(formData);
  const parsed = parseOpportunityOverrideForm(formData);

  if (!parsed.success) {
    redirect(
      `/admin/content/opportunities/${id}/edit?error=${encode(
        getValidationMessage(parsed.error),
      )}`,
    );
  }

  const { access } = await requireContentManager({
    publish: true,
    next: `/admin/content/opportunities/${id}/edit`,
  });
  const admin = getPhaseOneAdminClient();

  const { data: source, error: sourceError } = await admin
    .from("phaseone_external_opportunities")
    .select("id, starts_at, ends_at, is_active")
    .eq("id", id)
    .maybeSingle();

  if (sourceError || !source || !source.is_active) {
    redirect(
      `/admin/content/opportunities/${id}/edit?error=${encode(
        "The imported opportunity could not be found.",
      )}`,
    );
  }

  const effectiveStart = parsed.data.startsAt ?? source.starts_at;
  const effectiveEnd = parsed.data.endsAt ?? source.ends_at;
  if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
    redirect(
      `/admin/content/opportunities/${id}/edit?error=${encode(
        "End time must not be before the effective start time.",
      )}`,
    );
  }

  const { error } = await admin
    .from("phaseone_opportunity_overrides")
    .upsert(
      {
        external_opportunity_id: id,
        title: parsed.data.title,
        summary: parsed.data.summary,
        image_url: parsed.data.imageUrl,
        starts_at: parsed.data.startsAt,
        ends_at: parsed.data.endsAt,
        schedule_text: parsed.data.scheduleText,
        venue: parsed.data.venue,
        is_visible: parsed.data.isVisible,
        sort_order: parsed.data.sortOrder,
        updated_by: access.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "external_opportunity_id" },
    );

  if (error) {
    console.error("Unable to save opportunity overrides", {
      code: error.code,
      id,
    });
    redirect(
      `/admin/content/opportunities/${id}/edit?error=${encode(
        "Opportunity card overrides could not be saved.",
      )}`,
    );
  }

  revalidateOpportunityRoutes();
  redirect("/admin/content?success=opportunity_override_updated#opportunities");
}

export async function resetOpportunityOverride(formData: FormData) {
  const id = getId(formData);
  await requireContentManager({
    publish: true,
    next: `/admin/content/opportunities/${id}/edit`,
  });
  const admin = getPhaseOneAdminClient();

  const { error } = await admin
    .from("phaseone_opportunity_overrides")
    .delete()
    .eq("external_opportunity_id", id);

  if (error) {
    console.error("Unable to reset opportunity overrides", {
      code: error.code,
      id,
    });
    redirect(
      `/admin/content/opportunities/${id}/edit?error=${encode(
        "Opportunity card overrides could not be reset.",
      )}`,
    );
  }

  revalidateOpportunityRoutes();
  redirect("/admin/content?success=opportunity_override_reset#opportunities");
}
