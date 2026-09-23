"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const withdrawalSchema = z.object({
  registrationId: z.string().uuid(),
  reason: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(1000).nullable(),
  ),
});

export async function withdrawRegistration(formData: FormData) {
  const parsed = withdrawalSchema.safeParse({
    registrationId: formData.get("registrationId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirect("/dashboard?error=registration_withdraw_invalid");
  }

  const supabase = await createClient();
  const rpc = supabase as unknown as SupabaseClient;
  const { error } = await rpc.schema("core").rpc(
    "withdraw_keluarga_registration",
    {
      p_registration_id: parsed.data.registrationId,
      p_reason: parsed.data.reason,
    },
  );

  if (error) {
    console.error("Unable to withdraw KELUARGA registration", {
      code: error.code,
      registrationId: parsed.data.registrationId,
    });
    const code = error.message.includes("Attendance has already started")
      ? "registration_withdraw_started"
      : "registration_withdraw_failed";
    redirect(`/dashboard?error=${code}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/registrations");
  revalidatePath("/journey");
  redirect("/dashboard?success=registration_withdrawn");
}
