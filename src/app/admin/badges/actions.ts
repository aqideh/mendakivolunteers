"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireGamificationManager } from "@/lib/auth/gamification-access";

const definitionSchema = z.object({
  stableKey: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(500),
});

const awardSchema = z.object({
  volunteerId: z.string().uuid(),
  badgeId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
  requestId: z.string().uuid(),
});

const revokeSchema = z.object({
  awardId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
});

function redirectError(code: string): never {
  redirect(`/admin/badges?error=${encodeURIComponent(code)}`);
}

export async function createBadgeDefinition(formData: FormData) {
  const parsed = definitionSchema.safeParse({
    stableKey: formData.get("stableKey"),
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) redirectError("invalid_badge");

  const { supabase } = await requireGamificationManager("/admin/badges");
  const { error } = await supabase.schema("core").rpc("create_badge_definition", {
    p_stable_key: parsed.data.stableKey,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
  });

  if (error) {
    console.error("Unable to create badge definition", { code: error.code });
    redirectError(error.code === "23505" ? "badge_exists" : "badge_create_failed");
  }

  revalidatePath("/admin/badges");
  redirect("/admin/badges?success=badge_created");
}

export async function awardBadge(formData: FormData) {
  const parsed = awardSchema.safeParse({
    volunteerId: formData.get("volunteerId"),
    badgeId: formData.get("badgeId"),
    reason: formData.get("reason"),
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) redirectError("invalid_award");

  const { supabase } = await requireGamificationManager("/admin/badges");
  const { error } = await supabase.schema("core").rpc("award_badge", {
    p_volunteer_id: parsed.data.volunteerId,
    p_badge_id: parsed.data.badgeId,
    p_reason: parsed.data.reason,
    p_request_id: parsed.data.requestId,
  });

  if (error) {
    console.error("Unable to award badge", {
      code: error.code,
      volunteerId: parsed.data.volunteerId,
    });
    redirectError(error.code === "23505" ? "badge_already_awarded" : "award_failed");
  }

  revalidatePath("/admin/badges");
  revalidatePath("/dashboard");
  revalidatePath("/points");
  redirect("/admin/badges?success=badge_awarded");
}

export async function revokeBadge(formData: FormData) {
  const parsed = revokeSchema.safeParse({
    awardId: formData.get("awardId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) redirectError("invalid_revocation");

  const { supabase } = await requireGamificationManager("/admin/badges");
  const { error } = await supabase.schema("core").rpc("revoke_badge", {
    p_award_id: parsed.data.awardId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("Unable to revoke badge", { code: error.code });
    redirectError("revoke_failed");
  }

  revalidatePath("/admin/badges");
  revalidatePath("/dashboard");
  redirect("/admin/badges?success=badge_revoked");
}

