import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  OpportunityOverrideForm,
  type ImportedOpportunityForOverride,
  type OpportunityOverrideForForm,
} from "@/app/admin/content/opportunity-override-form";
import {
  resetOpportunityOverride,
  updateOpportunityOverride,
} from "@/app/admin/content/actions";
import { PortalHeader } from "@/components/portal-header";
import { requireContentManager } from "@/lib/auth/content-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = {
  title: "Edit opportunity card",
};

export const dynamic = "force-dynamic";

type EditOpportunityPageProps = {
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

export default async function EditOpportunityPage({
  params,
  searchParams,
}: EditOpportunityPageProps) {
  const { id } = await params;
  await requireContentManager({
    publish: true,
    next: `/admin/content/opportunities/${id}/edit`,
  });

  const admin = getPhaseOneAdminClient();
  const [opportunityResult, overrideResult, parameters] = await Promise.all([
    admin
      .from("phaseone_external_opportunities")
      .select(
        "id, title, summary, image_url, starts_at, ends_at, schedule_text, venue, is_active",
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("phaseone_opportunity_overrides")
      .select(
        "external_opportunity_id, title, summary, image_url, starts_at, ends_at, schedule_text, venue, is_visible, sort_order",
      )
      .eq("external_opportunity_id", id)
      .maybeSingle(),
    searchParams,
  ]);

  if (opportunityResult.error || overrideResult.error) {
    console.error("Unable to load opportunity card editor", {
      opportunityCode: opportunityResult.error?.code,
      overrideCode: overrideResult.error?.code,
      id,
    });
    throw new Error("Opportunity card editor could not be loaded");
  }

  if (!opportunityResult.data || !opportunityResult.data.is_active) {
    notFound();
  }

  return (
    <div className="site-shell">
      <PortalHeader status="Content management" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Opportunity card</p>
            <h1>Edit {opportunityResult.data.title}</h1>
            <p className="muted">
              Adjust how this imported opportunity appears in Keluarga MENDAKI without
              changing the source record.
            </p>
          </div>
        </div>

        <section className="section">
          <OpportunityOverrideForm
            opportunity={opportunityResult.data as ImportedOpportunityForOverride}
            override={(overrideResult.data as OpportunityOverrideForForm | null) ?? null}
            saveAction={updateOpportunityOverride}
            resetAction={resetOpportunityOverride}
            error={readParameter(parameters, "error")}
          />
        </section>
      </main>
    </div>
  );
}
