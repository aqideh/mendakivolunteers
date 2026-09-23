"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePathwayManager } from "@/lib/auth/pathway-access";

const assignmentSchema = z.object({
  volunteerId: z.string().uuid(),
  stageId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => value || null),
});

const clearSchema = z.object({
  positionId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
});

function redirectError(code: string): never {
  redirect(`/admin/pathways/positions?error=${encodeURIComponent(code)}`);
}

export async function assignVolunteerPosition(formData: FormData) {
  const parsed = assignmentSchema.safeParse({
    volunteerId: formData.get("volunteerId"),
    stageId: formData.get("stageId"),
    reason: formData.get("reason"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) redirectError("invalid_assignment");

  const { supabase } = await requirePathwayManager("/admin/pathways/positions");
  const { error } = await supabase
    .schema("pathways")
    .rpc("assign_volunteer_position", {
      p_volunteer_id: parsed.data.volunteerId,
      p_stage_id: parsed.data.stageId,
      p_reason: parsed.data.reason,
      p_notes: parsed.data.notes,
    });

  if (error) {
    console.error("Unable to assign volunteer pathway position", {
      code: error.code,
      volunteerId: parsed.data.volunteerId,
    });
    redirectError("assignment_failed");
  }

  revalidatePath("/admin/pathways/positions");
  revalidatePath("/dashboard");
  revalidatePath("/pathways");
  redirect("/admin/pathways/positions?success=position_assigned");
}

export async function clearVolunteerPosition(formData: FormData) {
  const parsed = clearSchema.safeParse({
    positionId: formData.get("positionId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) redirectError("invalid_clear");

  const { supabase } = await requirePathwayManager("/admin/pathways/positions");
  const { error } = await supabase
    .schema("pathways")
    .rpc("clear_volunteer_position", {
      p_position_id: parsed.data.positionId,
      p_reason: parsed.data.reason,
    });

  if (error) {
    console.error("Unable to clear volunteer pathway position", {
      code: error.code,
    });
    redirectError("clear_failed");
  }

  revalidatePath("/admin/pathways/positions");
  revalidatePath("/dashboard");
  revalidatePath("/pathways");
  redirect("/admin/pathways/positions?success=position_cleared");
}
