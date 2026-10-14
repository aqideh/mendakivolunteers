import "server-only";

import type { Metadata } from "next";

import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { EDITABLE_SEO_PAGES, findEditableSeoPage, publicPageMetadata, type EditableSeoPath } from "@/lib/seo";

export type SeoOverride = Readonly<{
  path: EditableSeoPath;
  title: string;
  description: string;
  updated_at: string;
}>;

export async function getEditableSeoOverrides(): Promise<SeoOverride[]> {
  const { data, error } = await getPhaseOneAdminClient()
    .schema("content")
    .from("seo_page_metadata")
    .select("path, title, description, updated_at")
    .in("path", EDITABLE_SEO_PAGES.map((page) => page.path));

  if (error || !data) {
    console.error("Unable to load SEO page metadata", { code: error?.code });
    throw new Error("SEO page metadata could not be loaded.");
  }

  return data as SeoOverride[];
}

export async function getEditablePageMetadata(path: EditableSeoPath): Promise<Metadata> {
  const defaultPage = findEditableSeoPage(path);
  if (!defaultPage) throw new Error("Unknown public SEO page.");

  const { data, error } = await getPhaseOneAdminClient()
    .schema("content")
    .from("seo_page_metadata")
    .select("title, description")
    .eq("path", path)
    .maybeSingle();

  if (error) {
    console.error("Unable to load public page SEO metadata", { code: error.code, path });
    throw new Error("Public page metadata could not be loaded.");
  }

  return publicPageMetadata({
    path,
    title: data?.title ?? defaultPage.title,
    description: data?.description ?? defaultPage.description,
  });
}
