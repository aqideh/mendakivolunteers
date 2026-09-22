"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account-access";

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  mobile: z.preprocess(
    (value) => {
      const text = typeof value === "string" ? value.trim() : "";
      return text || null;
    },
    z
      .string()
      .min(7)
      .max(40)
      .regex(/^[0-9+() .-]+$/)
      .nullable(),
  ),
});

export async function updateVolunteerProfile(formData: FormData) {
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    mobile: formData.get("mobile"),
  });

  if (!parsed.success) {
    redirect(
      "/dashboard?error=profile_validation&profile=edit",
    );
  }

  const { supabase } = await requireActiveAccount("/dashboard?profile=edit");
  const accountClient = supabase as unknown as SupabaseClient;
  const { error } = await accountClient
    .schema("core")
    .rpc("update_current_volunteer_profile", {
      p_display_name: parsed.data.displayName,
      p_mobile: parsed.data.mobile,
    });

  if (error) {
    console.error("Unable to update volunteer profile", {
      code: error.code,
    });
    redirect(
      "/dashboard?error=profile_update_failed&profile=edit",
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/opportunities");
  revalidatePath("/admin/registrations");
  redirect("/dashboard?success=profile_updated");
}
