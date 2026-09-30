"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const uuidSchema = z.string().uuid();
const sections = [
  "contact",
  "home",
  "personal",
  "interests",
  "skills",
  "availability",
  "event-readiness",
  "education",
  "photo",
  "about",
] as const;

async function requireReviewManager() {
  const { supabase, userId } = await requireActiveAccount(
    "/admin/reconciliation",
  );
  const rolesResult = await supabase
    .schema("core")
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (
    rolesResult.error ||
    !(rolesResult.data ?? []).some(
      ({ role }) => role === "admin" || role === "volteam",
    )
  ) {
    redirect("/dashboard?error=event_access_denied");
  }

  return { userId };
}

function note(formData: FormData) {
  const value = formData.get("notes");
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, 2000);
  return cleaned || null;
}

function refresh() {
  revalidatePath("/admin");
  revalidatePath("/admin/reconciliation");
}

export async function approveTemporaryVolunteer(formData: FormData) {
  const { userId } = await requireReviewManager();
  const parsedCaseId = uuidSchema.safeParse(formData.get("caseId"));
  if (!parsedCaseId.success) redirect("/admin/reconciliation?error=invalid");

  const admin = getPhaseOneAdminClient();
  const result = await admin
    .schema("core")
    .from("account_link_cases")
    .update({
      status: "resolved",
      reason_code: "temporary_profile_approved",
      review_outcome: "approved_new",
      requested_sections: [],
      volunteer_message: null,
      resolution_notes: note(formData),
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", parsedCaseId.data)
    .in("status", ["pending", "needs_review"]);

  if (result.error) {
    console.error("Temporary volunteer approval failed", { code: result.error.code });
    redirect("/admin/reconciliation?error=save");
  }

  refresh();
  redirect("/admin/reconciliation?success=approved");
}

export async function deferExistingVolunteerMatch(formData: FormData) {
  const { userId } = await requireReviewManager();
  const parsedCaseId = uuidSchema.safeParse(formData.get("caseId"));
  const parsedCandidateId = uuidSchema.safeParse(formData.get("candidateVolunteerId"));
  if (!parsedCaseId.success || !parsedCandidateId.success) {
    redirect("/admin/reconciliation?error=invalid");
  }

  const admin = getPhaseOneAdminClient();
  const candidateResult = await admin
    .schema("core")
    .from("volunteers")
    .select("id, auth_user_id")
    .eq("id", parsedCandidateId.data)
    .maybeSingle();

  if (
    candidateResult.error ||
    !candidateResult.data ||
    candidateResult.data.auth_user_id
  ) {
    redirect("/admin/reconciliation?error=candidate");
  }

  const result = await admin
    .schema("core")
    .from("account_link_cases")
    .update({
      status: "resolved",
      reason_code: "existing_match_deferred_until_verified_auth",
      review_outcome: "matched_existing_deferred",
      candidate_volunteer_id: parsedCandidateId.data,
      requested_sections: [],
      volunteer_message: null,
      resolution_notes: note(formData),
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", parsedCaseId.data)
    .in("status", ["pending", "needs_review"]);

  if (result.error) {
    console.error("Deferred volunteer match failed", { code: result.error.code });
    redirect("/admin/reconciliation?error=save");
  }

  refresh();
  redirect("/admin/reconciliation?success=matched");
}

export async function rejectAndRequestProfileRefill(formData: FormData) {
  await requireReviewManager();
  const parsedCaseId = uuidSchema.safeParse(formData.get("caseId"));
  const requestedSections = formData
    .getAll("requestedSections")
    .filter((value): value is string => typeof value === "string");
  const parsedSections = z.array(z.enum(sections)).min(1).safeParse(requestedSections);
  const messageValue = formData.get("message");
  const message =
    typeof messageValue === "string" ? messageValue.trim().slice(0, 2000) : "";

  if (!parsedCaseId.success || !parsedSections.success || !message) {
    redirect("/admin/reconciliation?error=refill");
  }

  const admin = getPhaseOneAdminClient();
  const result = await admin
    .schema("core")
    .from("account_link_cases")
    .update({
      status: "needs_review",
      reason_code: "profile_refill_required",
      review_outcome: "refill_required",
      candidate_volunteer_id: null,
      requested_sections: parsedSections.data,
      volunteer_message: message,
      submitted_for_review_at: null,
      resubmitted_at: null,
      resolution_notes: note(formData),
      resolved_by: null,
      resolved_at: null,
    })
    .eq("id", parsedCaseId.data)
    .in("status", ["pending", "needs_review"]);

  if (result.error) {
    console.error("Volunteer refill request failed", { code: result.error.code });
    redirect("/admin/reconciliation?error=save");
  }

  refresh();
  redirect("/admin/reconciliation?success=refill");
}
