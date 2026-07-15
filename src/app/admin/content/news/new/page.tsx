import type { Metadata } from "next";

import { createNewsPost } from "@/app/admin/content/actions";
import { NewsForm } from "@/app/admin/content/news-form";
import { PortalHeader } from "@/components/portal-header";
import { requireContentManager } from "@/lib/auth/content-access";

export const metadata: Metadata = {
  title: "New news post",
};

type NewNewsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewNewsPage({ searchParams }: NewNewsPageProps) {
  const { access } = await requireContentManager({
    next: "/admin/content/news/new",
  });
  const parameters = await searchParams;
  const errorValue = parameters.error;
  const error = Array.isArray(errorValue) ? errorValue[0] : errorValue;

  return (
    <div className="site-shell">
      <PortalHeader status="New news post" dashboard />
      <main className="page-frame narrow-frame">
        <section className="page-intro">
          <p className="eyebrow">Native CMS</p>
          <h1>Create news post</h1>
          <p className="lede">
            Publish volunteer-facing news independently of official YM Hub
            records.
          </p>
        </section>
        <NewsForm
          action={createNewsPost}
          canPublish={access.canPublish}
          error={error}
        />
      </main>
    </div>
  );
}
