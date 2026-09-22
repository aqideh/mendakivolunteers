"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const registrationSchema = z.object({
  eventId: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  displayName: z.string().trim().min(1).max(120),
  mobile: z.preprocess(
    (value) => {
      const text = typeof value === "string" ? value.trim() : "";
      return text || null;
    },
    z.string().max(40).nullable(),
  ),
  timeslotIds: z.array(z.string().uuid()).min(1).max(100),
});

function target(slug: string, key: "success" | "error", value: string): string {
  return `/opportunities/${slug}?${key}=${encodeURIComponent(value)}`;
}

export async function submitOpportunityRegistration(formData: FormData) {
  const parsed = registrationSchema.safeParse({
    eventId: formData.get("eventId"),
    slug: formData.get("slug"),
    displayName: formData.get("displayName"),
    mobile: formData.get("mobile"),
    timeslotIds: formData.getAll("timeslotId"),
  });

  const rawSlug = formData.get("slug");
  const safeSlug =
    typeof rawSlug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawSlug)
      ? rawSlug
      : "";

  if (!parsed.success) {
    redirect(
      safeSlug
        ? target(safeSlug, "error", "Check your name and select at least one available shift.")
        : "/opportunities",
    );
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) {
    redirect(`/login?next=${encodeURIComponent(`/opportunities/${parsed.data.slug}`)}`);
  }

  const rpcClient = supabase as unknown as SupabaseClient;
  const { error } = await rpcClient.schema("core").rpc("submit_keluarga_registration", {
    p_event_id: parsed.data.eventId,
    p_timeslot_ids: parsed.data.timeslotIds,
    p_display_name: parsed.data.displayName,
    p_mobile: parsed.data.mobile,
  });

  if (error) {
    console.error("Unable to submit KELUARGA registration", {
      code: error.code,
      eventId: parsed.data.eventId,
    });
    const message = error.message.includes("deadline")
      ? "The registration deadline has passed."
      : error.message.includes("unavailable")
        ? "One or more selected shifts are no longer available."
        : error.message.includes("already been reviewed")
          ? "This registration has already been reviewed and can no longer be changed."
          : "Your registration could not be submitted. Check the details and try again.";
    redirect(target(parsed.data.slug, "error", message));
  }

  revalidatePath("/dashboard");
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${parsed.data.slug}`);
  redirect(target(parsed.data.slug, "success", "registration_submitted"));
}
