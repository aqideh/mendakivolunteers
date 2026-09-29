import "server-only";

import { cache } from "react";

import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export type PublicNewsListItem = Readonly<{
  id: string;
  slug: string;
  title: string;
  summary: string;
  featured: boolean;
  published_at: string | null;
  publish_at: string | null;
}>;

export type PublicNewsPost = PublicNewsListItem &
  Readonly<{
    body: string;
  }>;

type PublicNewsVisibilityRow = Readonly<{
  status: string;
  created_at: string;
  published_at: string | null;
  publish_at: string | null;
  expires_at: string | null;
}>;

function isVisiblePublicNews(
  row: PublicNewsVisibilityRow,
  now = new Date(),
): boolean {
  const nowMs = now.getTime();
  const publishAtMs = row.publish_at ? Date.parse(row.publish_at) : null;
  const publishedAtMs = row.published_at ? Date.parse(row.published_at) : null;
  const createdAtMs = Date.parse(row.created_at);
  const expiresAtMs = row.expires_at ? Date.parse(row.expires_at) : null;

  const statusVisible =
    row.status === "published" ||
    (row.status === "scheduled" &&
      publishAtMs !== null &&
      Number.isFinite(publishAtMs) &&
      publishAtMs <= nowMs);

  const effectivePublishedAt =
    publishedAtMs ?? publishAtMs ?? createdAtMs;

  return (
    statusVisible &&
    Number.isFinite(effectivePublishedAt) &&
    effectivePublishedAt <= nowMs &&
    (expiresAtMs === null ||
      (Number.isFinite(expiresAtMs) && expiresAtMs > nowMs))
  );
}

export const getPublicNewsPosts = cache(
  async (): Promise<PublicNewsListItem[]> => {
    const admin = getPhaseOneAdminClient();
    const { data, error } = await admin
      .schema("content")
      .from("news_posts")
      .select(
        "id, slug, title, summary, featured, status, created_at, published_at, publish_at, expires_at",
      )
      .in("status", ["published", "scheduled"])
      .order("featured", { ascending: false })
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(500);

    if (error || !data) {
      console.error("Unable to load public news", { code: error?.code });
      throw new Error("Public news could not be loaded");
    }

    return data
      .filter((row) => isVisiblePublicNews(row))
      .slice(0, 100)
      .map((row) => ({
        id: String(row.id),
        slug: String(row.slug),
        title: String(row.title),
        summary: String(row.summary),
        featured: Boolean(row.featured),
        published_at: row.published_at ? String(row.published_at) : null,
        publish_at: row.publish_at ? String(row.publish_at) : null,
      }));
  },
);

export async function getPublicNewsPostBySlug(
  slug: string,
): Promise<PublicNewsPost | null> {
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin
    .schema("content")
    .from("news_posts")
    .select(
      "id, slug, title, summary, body, featured, status, created_at, published_at, publish_at, expires_at",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Unable to load public news post", {
      code: error.code,
      slug,
    });
    throw new Error("News post could not be loaded");
  }

  if (!data || !isVisiblePublicNews(data)) {
    return null;
  }

  return {
    id: String(data.id),
    slug: String(data.slug),
    title: String(data.title),
    summary: String(data.summary),
    body: String(data.body),
    featured: Boolean(data.featured),
    published_at: data.published_at ? String(data.published_at) : null,
    publish_at: data.publish_at ? String(data.publish_at) : null,
  };
}
