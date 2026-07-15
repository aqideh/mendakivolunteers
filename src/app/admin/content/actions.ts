"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireContentManager } from "@/lib/auth/content-access";
import {
  getValidationMessage,
  parseNewsForm,
  parseOpportunityForm,
} from "@/lib/content/validation";
import type { ContentStatus } from "@/types/database";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encode(value: string): string {
  return encodeURIComponent(value);
}

function requiresPublisher(status: ContentStatus): boolean {
  return ["scheduled", "published", "archived"].includes(status);
}

function getSubmittedId(formData: FormData): string {
  const value = formData.get("id");

  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new Error("Invalid content identifier.");
  }

  return value;
}

function revalidateContentRoutes() {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/opportunities");
  revalidatePath("/news");
  revalidatePath("/admin/content");
}

export async function createOpportunity(formData: FormData) {
  const parsed = parseOpportunityForm(formData);

  if (!parsed.success) {
    redirect(
      `/admin/content/opportunities/new?error=${encode(getValidationMessage(parsed.error))}`,
    );
  }

  const { supabase, access } = await requireContentManager({
    publish: requiresPublisher(parsed.data.status),
    next: "/admin/content/opportunities/new",
  });

  const { error } = await supabase.schema("content").from("opportunities").insert({
    slug: parsed.data.slug,
    title: parsed.data.title,
    summary: parsed.data.summary,
    body: parsed.data.body,
    category: parsed.data.category,
    location_name: parsed.data.locationName,
    is_remote: parsed.data.isRemote,
    starts_at: parsed.data.startsAt,
    ends_at: parsed.data.endsAt,
    registration_deadline: parsed.data.registrationDeadline,
    registration_url: parsed.data.registrationUrl,
    ymhub_activity_id: parsed.data.ymhubActivityId,
    featured: parsed.data.featured,
    status: parsed.data.status,
    publish_at: parsed.data.publishAt,
    expires_at: parsed.data.expiresAt,
    created_by: access.userId,
    updated_by: access.userId,
  });

  if (error) {
    console.error("Unable to create opportunity", { code: error.code });
    redirect(
      `/admin/content/opportunities/new?error=${encode("Opportunity could not be saved. Check for a duplicate slug and valid dates.")}`,
    );
  }

  revalidateContentRoutes();
  redirect("/admin/content?success=opportunity_created");
}

export async function updateOpportunity(formData: FormData) {
  let id: string;

  try {
    id = getSubmittedId(formData);
  } catch {
    redirect(`/admin/content?error=${encode("Invalid opportunity identifier.")}`);
  }

  const parsed = parseOpportunityForm(formData);

  if (!parsed.success) {
    redirect(
      `/admin/content/opportunities/${id}/edit?error=${encode(getValidationMessage(parsed.error))}`,
    );
  }

  const { supabase, access } = await requireContentManager({
    publish: requiresPublisher(parsed.data.status),
    next: `/admin/content/opportunities/${id}/edit`,
  });

  const { error } = await supabase
    .schema("content")
    .from("opportunities")
    .update({
      slug: parsed.data.slug,
      title: parsed.data.title,
      summary: parsed.data.summary,
      body: parsed.data.body,
      category: parsed.data.category,
      location_name: parsed.data.locationName,
      is_remote: parsed.data.isRemote,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      registration_deadline: parsed.data.registrationDeadline,
      registration_url: parsed.data.registrationUrl,
      ymhub_activity_id: parsed.data.ymhubActivityId,
      featured: parsed.data.featured,
      status: parsed.data.status,
      publish_at: parsed.data.publishAt,
      expires_at: parsed.data.expiresAt,
      updated_by: access.userId,
    })
    .eq("id", id);

  if (error) {
    console.error("Unable to update opportunity", { code: error.code, id });
    redirect(
      `/admin/content/opportunities/${id}/edit?error=${encode("Opportunity could not be updated. Publishing changes require publisher access.")}`,
    );
  }

  revalidateContentRoutes();
  redirect("/admin/content?success=opportunity_updated");
}

export async function createNewsPost(formData: FormData) {
  const parsed = parseNewsForm(formData);

  if (!parsed.success) {
    redirect(
      `/admin/content/news/new?error=${encode(getValidationMessage(parsed.error))}`,
    );
  }

  const { supabase, access } = await requireContentManager({
    publish: requiresPublisher(parsed.data.status),
    next: "/admin/content/news/new",
  });

  const { error } = await supabase.schema("content").from("news_posts").insert({
    slug: parsed.data.slug,
    title: parsed.data.title,
    summary: parsed.data.summary,
    body: parsed.data.body,
    featured: parsed.data.featured,
    status: parsed.data.status,
    publish_at: parsed.data.publishAt,
    expires_at: parsed.data.expiresAt,
    created_by: access.userId,
    updated_by: access.userId,
  });

  if (error) {
    console.error("Unable to create news post", { code: error.code });
    redirect(
      `/admin/content/news/new?error=${encode("News post could not be saved. Check for a duplicate slug and valid dates.")}`,
    );
  }

  revalidateContentRoutes();
  redirect("/admin/content?success=news_created");
}

export async function updateNewsPost(formData: FormData) {
  let id: string;

  try {
    id = getSubmittedId(formData);
  } catch {
    redirect(`/admin/content?error=${encode("Invalid news post identifier.")}`);
  }

  const parsed = parseNewsForm(formData);

  if (!parsed.success) {
    redirect(
      `/admin/content/news/${id}/edit?error=${encode(getValidationMessage(parsed.error))}`,
    );
  }

  const { supabase, access } = await requireContentManager({
    publish: requiresPublisher(parsed.data.status),
    next: `/admin/content/news/${id}/edit`,
  });

  const { error } = await supabase
    .schema("content")
    .from("news_posts")
    .update({
      slug: parsed.data.slug,
      title: parsed.data.title,
      summary: parsed.data.summary,
      body: parsed.data.body,
      featured: parsed.data.featured,
      status: parsed.data.status,
      publish_at: parsed.data.publishAt,
      expires_at: parsed.data.expiresAt,
      updated_by: access.userId,
    })
    .eq("id", id);

  if (error) {
    console.error("Unable to update news post", { code: error.code, id });
    redirect(
      `/admin/content/news/${id}/edit?error=${encode("News post could not be updated. Publishing changes require publisher access.")}`,
    );
  }

  revalidateContentRoutes();
  redirect("/admin/content?success=news_updated");
}
