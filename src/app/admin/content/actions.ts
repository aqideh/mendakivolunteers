"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireContentManager } from "@/lib/auth/content-access";
import { readRequiredUuid } from "@/lib/content/identifiers";
import {
  getValidationMessage,
  parseNewsForm,
  parseOpportunityForm,
} from "@/lib/content/validation";
import { getRegistrationAllowedHosts } from "@/lib/env";
import type { ContentStatus } from "@/types/database";

function encode(value: string): string {
  return encodeURIComponent(value);
}

function requiresPublisher(status: ContentStatus): boolean {
  return ["scheduled", "published", "archived"].includes(status);
}

function getContentIdOrRedirect(
  formData: FormData,
  errorMessage: string,
): string {
  try {
    return readRequiredUuid(formData, "id");
  } catch {
    redirect(`/admin/content?error=${encode(errorMessage)}`);
  }
}

function revalidateContentRoutes() {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/opportunities");
  revalidatePath("/news");
  revalidatePath("/admin/content");
}

function parseOpportunity(formData: FormData) {
  return parseOpportunityForm(formData, getRegistrationAllowedHosts());
}

export async function createOpportunity(formData: FormData) {
  const parsed = parseOpportunity(formData);

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
  const id = getContentIdOrRedirect(
    formData,
    "Invalid opportunity identifier.",
  );
  const parsed = parseOpportunity(formData);

  if (!parsed.success) {
    redirect(
      `/admin/content/opportunities/${id}/edit?error=${encode(getValidationMessage(parsed.error))}`,
    );
  }

  const { supabase, access } = await requireContentManager({
    publish: requiresPublisher(parsed.data.status),
    next: `/admin/content/opportunities/${id}/edit`,
  });

  const { data: updated, error } = await supabase
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
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    console.error("Unable to update opportunity", {
      code: error?.code,
      id,
      found: Boolean(updated),
    });
    redirect(
      `/admin/content/opportunities/${id}/edit?error=${encode("Opportunity could not be updated. It may no longer exist, or publisher access may be required.")}`,
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
  const id = getContentIdOrRedirect(formData, "Invalid news post identifier.");
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

  const { data: updated, error } = await supabase
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
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    console.error("Unable to update news post", {
      code: error?.code,
      id,
      found: Boolean(updated),
    });
    redirect(
      `/admin/content/news/${id}/edit?error=${encode("News post could not be updated. It may no longer exist, or publisher access may be required.")}`,
    );
  }

  revalidateContentRoutes();
  redirect("/admin/content?success=news_updated");
}
