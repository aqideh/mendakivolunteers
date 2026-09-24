"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireVolunteerManager } from "@/lib/auth/volunteer-management-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const reviewSchema = z.object({
  applicationId: z.string().uuid(),
  decision: z.enum(["reviewing", "accepted", "not_selected"]),
  note: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(1500).nullable(),
  ),
});

export async function reviewRecruitmentApplication(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    applicationId: formData.get("applicationId"),
    decision: formData.get("decision"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    redirect("/admin/recruitment?error=Application%20review%20details%20are%20invalid.");
  }

  const { userId } = await requireVolunteerManager("/admin/recruitment");
  const admin = getPhaseOneAdminClient();
  const { error } = await admin.schema("core").rpc(
    "review_keluarga_recruitment_application",
    {
      p_application_id: parsed.data.applicationId,
      p_decision: parsed.data.decision,
      p_note: parsed.data.note,
      p_actor_user_id: userId,
    },
  );

  if (error) {
    console.error("Unable to review recruitment application", {
      code: error.code,
      applicationId: parsed.data.applicationId,
    });
    redirect(
      `/admin/recruitment?error=${encodeURIComponent(
        error.message.includes("already been closed")
          ? "This application has already been closed."
          : "The recruitment application could not be updated.",
      )}`,
    );
  }

  revalidatePath("/admin/recruitment");
  revalidatePath("/volunteer/interest");
  redirect(
    `/admin/recruitment?success=${encodeURIComponent(
      `application_${parsed.data.decision}`,
    )}`,
  );
}
