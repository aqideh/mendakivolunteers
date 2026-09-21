import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { requireContentManager } from "@/lib/auth/content-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

import {
  resetOpportunityCardOverride,
  saveOpportunityCardOverride,
} from "../../override-actions";
import { OpportunityCardOverrideForm } from "../../opportunity-override-form";

export const metadata: Metadata = {
  title: "Edit opportunity card",
};

export const dynamic = "force-dynamic";

type EditOpportunityCardPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParameter(
  parameters: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = parameters[name];
  return Array.isArray(value) ? value[0] : value;
}

export default async function EditOpportunityCardPage({
  params,
  searchParams,
}: EditOpportunityCardPageProps) {
  const { id } = await params;
  const query = await searchParams;
  await requireContentManager({
    next: `/admin/content/opportunities/${id}/edit`,
  });

  const admin = getPhaseOneAdminClient();
  const [sourceResult, overrideResult] = await Promise.all([
    admin
      .from("phaseone_external_opportunities")
      .select(
        "id, title, summary, image_url, starts_at, ends_at, schedule_text, venue",
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("phaseone_opportunity_overrides")
      .select(
        "opportunity_id, title, summary, image_url, starts_at, ends_at, schedule_text, venue, is_hidden, sort_order",
      )
      .eq("opportunity_id", id)
      .maybeSingle(),
  ]);

  if (sourceResult.error || overrideResult.error) {
    console.error("Unable to load opportunity card editor", {
      sourceCode: sourceResult.error?.code,
      overrideCode: overrideResult.error?.code,
      opportunityId: id,
    });
    throw new Error("Opportunity card editor could not be loaded");
  }

  const source = sourceResult.data;
  if (!source) {
    notFound();
  }

  const override = overrideResult.data;
  const opportunity = {
    id: source.id,
    title: override?.title ?? source.title,
    summary: override ? override.summary : source.summary,
    image_url: override ? override.image_url : source.image_url,
    starts_at: override ? override.starts_at : source.starts_at,
    ends_at: override ? override.ends_at : source.ends_at,
    schedule_text: override ? override.schedule_text : source.schedule_text,
    venue: override ? override.venue : source.venue,
    sort_order: override?.sort_order ?? null,
    is_hidden: override?.is_hidden ?? false,
    has_override: Boolean(override),
  };

  return (
    <div className="site-shell">
      <PortalHeader status="Content management" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Opportunity card</p>
            <h1>Edit public listing</h1>
            <p className="muted">
              Manual changes affect the public card only. The imported source record
              remains unchanged.
            </p>
          </div>
        </div>

        <OpportunityCardOverrideForm
          opportunity={opportunity}
          saveAction={saveOpportunityCardOverride}
          resetAction={resetOpportunityCardOverride}
          error={readParameter(query, "error")}
        />
      </main>
      <footer className="site-footer">MENDAKI Volunteer Portal CMS</footer>
    </div>
  );
}
