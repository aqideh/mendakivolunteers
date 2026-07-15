import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { updateOpportunity } from "@/app/admin/content/actions";
import { OpportunityForm } from "@/app/admin/content/opportunity-form";
import { PortalHeader } from "@/components/portal-header";
import { requireContentManager } from "@/lib/auth/content-access";
import { isUuid } from "@/lib/content/identifiers";
import type { ContentStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "Edit opportunity",
};

type EditOpportunityPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const publisherStatuses = new Set<ContentStatus>([
  "scheduled",
  "published",
  "archived",
]);

export default async function EditOpportunityPage({
  params,
  searchParams,
}: EditOpportunityPageProps) {
  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const { supabase, access } = await requireContentManager({
    next: `/admin/content/opportunities/${id}/edit`,
  });
  const { data: opportunity, error: loadError } = await supabase
    .schema("content")
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    console.error("Unable to load opportunity for editing", {
      code: loadError.code,
      id,
    });
  }

  if (!opportunity) {
    notFound();
  }

  if (!access.canPublish && publisherStatuses.has(opportunity.status)) {
    redirect(
      "/admin/content?error=Publisher%20permission%20is%20required%20to%20edit%20published%2C%20scheduled%2C%20or%20archived%20content.",
    );
  }

  const parameters = await searchParams;
  const errorValue = parameters.error;
  const error = Array.isArray(errorValue) ? errorValue[0] : errorValue;

  return (
    <div className="site-shell">
      <PortalHeader status="Edit opportunity" dashboard />
      <main className="page-frame narrow-frame">
        <section className="page-intro">
          <p className="eyebrow">Native CMS</p>
          <h1>Edit opportunity</h1>
          <p className="lede">
            Saving creates an immutable revision snapshot. Registration remains
            external to this portal.
          </p>
        </section>
        <OpportunityForm
          action={updateOpportunity}
          opportunity={opportunity}
          canPublish={access.canPublish}
          error={error}
        />
      </main>
    </div>
  );
}
