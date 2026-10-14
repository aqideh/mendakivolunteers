"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireContentManager } from "@/lib/auth/content-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { findEditableSeoPage } from "@/lib/seo";

const editSchema = z.object({
  path: z.string(),
  title: z.string().trim().min(10).max(80),
  description: z.string().trim().min(30).max(240),
});

export async function saveSeoMetadata(form: FormData) {
  const { access } = await requireContentManager({
    next: "/admin/website-analytics/seo",
  });
  const parsed = editSchema.safeParse({
    path: form.get("path"),
    title: form.get("title"),
    description: form.get("description"),
  });

  if (!parsed.success || !findEditableSeoPage(parsed.data.path)) {
    throw new Error("Enter a valid title (10–80 characters) and description (30–240 characters).");
  }

  const { error } = await getPhaseOneAdminClient()
    .schema("content")
    .from("seo_page_metadata")
    .upsert({
      path: parsed.data.path,
      title: parsed.data.title,
      description: parsed.data.description,
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "path" });
  if (error) {
    console.error("Unable to update SEO page metadata", { code: error.code });
    throw new Error("SEO metadata could not be saved.");
  }

  revalidatePath(parsed.data.path);
  revalidatePath("/admin/website-analytics/seo");
  redirect("/admin/website-analytics/seo?saved=" + encodeURIComponent(parsed.data.path));
}
