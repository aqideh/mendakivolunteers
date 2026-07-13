import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDate } from "@/lib/content/dates";
import { createClient } from "@/lib/supabase/server";

type NewsPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: NewsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .schema("content")
    .from("news_posts")
    .select("title, summary")
    .eq("slug", slug)
    .maybeSingle();

  return data
    ? { title: data.title, description: data.summary }
    : { title: "News post not found" };
}

export default async function NewsPostPage({ params }: NewsPageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: post, error } = await supabase
    .schema("content")
    .from("news_posts")
    .select("id, title, summary, body, featured, published_at, publish_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Unable to load news post", { code: error.code, slug });
  }

  if (!post) {
    notFound();
  }

  const bodyParagraphs = post.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="site-shell">
      <PortalHeader status="Volunteer news" />
      <main className="page-frame narrow-frame">
        <Link className="back-link" href="/news">
          ← All news
        </Link>
        <article className="content-detail">
          <div className="content-card-meta">
            <span className="tag">
              {formatSingaporeDate(post.published_at ?? post.publish_at)}
            </span>
            {post.featured ? (
              <span className="tag tag-accent">Featured</span>
            ) : null}
          </div>
          <h1>{post.title}</h1>
          <p className="lede">{post.summary}</p>
          <div className="prose-block">
            {bodyParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </article>
      </main>
      <footer className="site-footer">MENDAKI Volunteer Portal</footer>
    </div>
  );
}
