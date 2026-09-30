"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const redeemSchema = z.object({
  rewardId: z.string().uuid(),
  requestId: z.string().uuid(),
});

function redemptionErrorCode(message: string): string {
  const known = [
    "reward_unavailable",
    "insufficient_points",
    "limit_reached",
    "out_of_stock",
    "volunteer_profile_required",
    "account_inactive",
  ];

  return known.find((code) => message.includes(code)) ?? "redemption_failed";
}

export async function redeemReward(formData: FormData) {
  const parsed = redeemSchema.safeParse({
    rewardId: formData.get("rewardId"),
    requestId: formData.get("requestId"),
  });

  if (!parsed.success) {
    redirect("/rewards?error=invalid_request");
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect(`/login?next=${encodeURIComponent("/rewards")}`);
  }

  const client = supabase as unknown as SupabaseClient;
  const { data, error } = await client.schema("core").rpc("redeem_reward", {
    p_reward_id: parsed.data.rewardId,
    p_request_id: parsed.data.requestId,
  });

  if (error) {
    console.error("Unable to redeem reward", {
      code: error.code,
      rewardId: parsed.data.rewardId,
      requestId: parsed.data.requestId,
    });
    redirect(`/rewards?error=${redemptionErrorCode(error.message)}`);
  }

  const redemption = data as { id?: string } | null;
  revalidatePath("/rewards");
  revalidatePath("/points");
  revalidatePath("/dashboard");
  redirect(
    `/rewards?success=redeemed${redemption?.id ? `&redemption=${encodeURIComponent(redemption.id)}` : ""}`,
  );
}
