import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { updateNewsPost } from "@/app/admin/content/actions";
import { NewsForm } from "@/app/admin/content/news-form";
import { PortalHeader } from "@/components/portal-header";
import { requireContentManager } from "@/lib/auth/content-access";
import type { ContentStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "Edit news post",
};

type EditNewsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const publisherStatuses = new Set<ContentStatus>([
  "scheduled",
  "published",
  "archived",
]);

export default async function EditNewsPage({
  params,
  searchParams,
}: EditNewsPageProps) {
  const { id } = await params;
  const { supabase, access } = await requireContentManager({
    next: `/admin/content/news/${id}/edit`,
  });
  const { data: post, error: loadError } = await supabase
    .schema("content")
    .from("news_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    console.error("Unable to load news post for editing", {
      code: loadError.code,
      id,
    });
  }

  if (!post) {
    notFound();
  }

  if (!access.canPublish && publisherStatuses.has(post.status)) {
    redirect(
      "/admin/content?error=Publisher%20permission%20is%20required%20to%20edit%20published%2C%20scheduled%2C%20or%20archived%20content.",
    );
  }

  const parameters = await searchParams;
  const errorValue = parameters.error;
  const error = Array.isArray(errorValue) ? errorValue[0] : errorValue;

  return (
    <div className="site-shell">
      <PortalHeader status="Edit news post" dashboard />
      <main className="page-frame narrow-frame">
        <section className="page-intro">
          <p className="eyebrow">Native CMS</p>
          <h1>Edit news post</h1>
          <p className="lede">
            Saving creates an immutable revision snapshot and audit event.
          </p>
        </section>
        <NewsForm
          action={updateNewsPost}
          post={post}
          canPublish={access.canPublish}
          error={error}
        />
      </main>
    </div>
  );
}
