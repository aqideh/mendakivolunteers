"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function confirmProfileReview() {
  const supabase = await createClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  if (error || !claims?.claims?.sub) redirect("/login?next=%2Fdashboard");

  const client = (supabase as unknown as SupabaseClient).schema("core");
  const reviewed = await client.rpc("record_volunteer_engagement", {
    p_action: "profile_review",
  });
  if (reviewed.error) {
    console.error("Could not record profile review", { code: reviewed.error.code });
    redirect("/dashboard?error=profile_review_failed");
  }

  // This RPC checks all nine profile milestones in the database; an incomplete
  // profile cannot claim the one-time completion award.
  const complete = await client.rpc("record_volunteer_engagement", {
    p_action: "profile_complete",
  });
  if (complete.error && complete.error.code !== "22023") {
    console.error("Could not check profile completion award", { code: complete.error.code });
  }
  redirect("/dashboard?success=profile_reviewed");
}
