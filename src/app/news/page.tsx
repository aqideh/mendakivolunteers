import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDate } from "@/lib/content/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Volunteer news",
  description: "Updates and announcements for MENDAKI volunteers.",
};

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const supabase = await createClient();
  const { data: posts, error } = await supabase
    .schema("content")
    .from("news_posts")
    .select("id, slug, title, summary, featured, published_at, publish_at")
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) {
    console.error("Unable to load public news", { code: error.code });
  }

  return (
    <div className="site-shell">
      <PortalHeader status="Volunteer news" />
      <main className="page-frame">
        <section className="page-intro">
          <p className="eyebrow">News and announcements</p>
          <h1>Updates for the volunteer community.</h1>
          <p className="lede">
            Portal content is managed by MENDAKI staff and is separate from
            official volunteer records in YM Hub.
          </p>
        </section>

        {error ? (
          <div className="notice notice-error" role="alert">
            News is temporarily unavailable.
          </div>
        ) : posts && posts.length > 0 ? (
          <section className="content-grid" aria-label="Volunteer news">
            {posts.map((post) => (
              <article
                className={`content-card${post.featured ? " content-card-featured" : ""}`}
                key={post.id}
              >
                <div className="content-card-meta">
                  <span className="tag">
                    {formatSingaporeDate(post.published_at ?? post.publish_at)}
                  </span>
                  {post.featured ? (
                    <span className="tag tag-accent">Featured</span>
                  ) : null}
                </div>
                <h2>
                  <Link href={`/news/${post.slug}`}>{post.title}</Link>
                </h2>
                <p>{post.summary}</p>
                <Link className="text-link" href={`/news/${post.slug}`}>
                  Read update
                </Link>
              </article>
            ))}
          </section>
        ) : (
          <section className="panel empty-state">
            <h2>No news has been published.</h2>
            <p className="muted">Published updates will appear here.</p>
          </section>
        )}
      </main>
      <footer className="site-footer">MENDAKI Volunteer Portal</footer>
    </div>
  );
}
