import type { Metadata } from "next";

import { createOpportunity } from "@/app/admin/content/actions";
import { OpportunityForm } from "@/app/admin/content/opportunity-form";
import { PortalHeader } from "@/components/portal-header";
import { requireContentManager } from "@/lib/auth/content-access";

export const metadata: Metadata = {
  title: "New opportunity",
};

type NewOpportunityPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewOpportunityPage({
  searchParams,
}: NewOpportunityPageProps) {
  const { access } = await requireContentManager({
    next: "/admin/content/opportunities/new",
  });
  const parameters = await searchParams;
  const errorValue = parameters.error;
  const error = Array.isArray(errorValue) ? errorValue[0] : errorValue;

  return (
    <div className="site-shell">
      <PortalHeader status="New opportunity" dashboard />
      <main className="page-frame narrow-frame">
        <section className="page-intro">
          <p className="eyebrow">Native CMS</p>
          <h1>Create opportunity</h1>
          <p className="lede">
            This creates a discovery listing in the portal. It does not create a
            registration record in YM Hub.
          </p>
        </section>
        <OpportunityForm
          action={createOpportunity}
          canPublish={access.canPublish}
          error={error}
        />
      </main>
    </div>
  );
}
