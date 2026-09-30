"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export async function resubmitProfileReview() {
  const { userId } = await requireActiveAccount("/account/review");
  const admin = getPhaseOneAdminClient();
  const now = new Date().toISOString();

  const result = await admin
    .schema("core")
    .from("account_link_cases")
    .update({
      status: "pending",
      reason_code: "temporary_unverified_email",
      review_outcome: null,
      requested_sections: [],
      volunteer_message: null,
      submitted_for_review_at: now,
      resubmitted_at: now,
      resolved_by: null,
      resolved_at: null,
    })
    .eq("auth_user_id", userId)
    .eq("status", "needs_review")
    .eq("review_outcome", "refill_required");

  if (result.error) {
    console.error("Volunteer review resubmission failed", { code: result.error.code });
    redirect("/account/review?error=resubmit");
  }

  revalidatePath("/account/review");
  revalidatePath("/admin/reconciliation");
  revalidatePath("/admin");
  redirect("/account/review?success=resubmitted");
}
