import type { Metadata } from "next";

import { EventForm } from "@/components/phaseone/event-form";
import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = { title: "New event" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parameter(values: Record<string, string | string[] | undefined>, key: string) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewEventPage({ searchParams }: PageProps) {
  await requireEventManager("/admin/events/new");
  const admin = getPhaseOneAdminClient();
  const { data: opportunities, error } = await admin
    .from("phaseone_external_opportunities")
    .select("id, title, starts_at")
    .eq("is_active", true)
    .order("starts_at", { ascending: true })
    .limit(200);

  if (error || !opportunities) {
    throw new Error("Opportunity options could not be loaded");
  }

  const parameters = await searchParams;
  const errorMessage = parameter(parameters, "error");

  return (
    <div className="site-shell">
      <PortalHeader status="New event" dashboard />
      <main className="page-frame narrow-frame">
        <section className="page-intro">
          <p className="eyebrow">Phase-one operations</p>
          <h1>Create volunteer event</h1>
          <p className="lede">Create the public event page and configure PIN-protected attendance destinations.</p>
        </section>
        {errorMessage ? <div className="notice notice-error" role="alert">{errorMessage}</div> : null}
        <EventForm opportunities={opportunities} />
      </main>
    </div>
  );
}
