"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireGamificationManager } from "@/lib/auth/gamification-access";

const awardSchema = z.object({
  volunteerId: z.string().uuid(),
  requestId: z.string().uuid(),
  points: z
    .string()
    .trim()
    .regex(/^\d{1,5}(?:\.\d{1,2})?$/),
  reason: z.string().trim().min(5).max(500),
});

export async function awardManualPoints(formData: FormData) {
  const parsed = awardSchema.safeParse({
    volunteerId: formData.get("volunteerId"),
    requestId: formData.get("requestId"),
    points: formData.get("points"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirect("/admin/points?error=invalid_award");
  }

  const points = Number(parsed.data.points);
  if (!Number.isFinite(points) || points <= 0 || points > 10000) {
    redirect("/admin/points?error=invalid_award");
  }

  const { supabase } = await requireGamificationManager("/admin/points");
  const client = supabase as unknown as SupabaseClient;
  const { error } = await client.schema("core").rpc("award_manual_points", {
    p_volunteer_id: parsed.data.volunteerId,
    p_points: points,
    p_reason: parsed.data.reason,
    p_request_id: parsed.data.requestId,
  });

  if (error) {
    console.error("Unable to award manual recognition points", {
      code: error.code,
      volunteerId: parsed.data.volunteerId,
      requestId: parsed.data.requestId,
    });
    redirect("/admin/points?error=award_failed");
  }

  revalidatePath("/admin/points");
  revalidatePath("/points");
  revalidatePath("/dashboard");
  redirect("/admin/points?success=points_awarded");
}
