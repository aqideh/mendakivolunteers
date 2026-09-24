import type { Metadata } from "next";

import { EventForm } from "@/components/phaseone/event-form";
import { PortalHeader } from "@/components/portal-header";
import { SectionIndex } from "@/components/section-index";
import { requireProgrammeManager } from "@/lib/auth/event-access";

export const metadata: Metadata = { title: "New programme" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parameter(values: Record<string, string | string[] | undefined>, key: string) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewEventPage({ searchParams }: PageProps) {
  await requireProgrammeManager("/admin/events/new");
  const parameters = await searchParams;
  const errorMessage = parameter(parameters, "error");

  return (
    <div className="site-shell">
      <PortalHeader status="New programme" dashboard />
      <main className="page-frame narrow-frame">
        <section className="page-intro">
          <p className="eyebrow">Volunteer programme</p>
          <h1>Create programme or event</h1>
          <p className="lede">
            Create the programme once. Its public opportunity listing, schedule,
            Event Guide and Event Operations all use this record.
          </p>
        </section>

        <SectionIndex
          label="Programme form sections"
          items={[
            { href: "#event-schedule", label: "Schedule" },
            { href: "#event-opportunity", label: "Opportunity" },
            { href: "#event-location", label: "Location" },
            { href: "#event-preparation", label: "Preparation" },
            { href: "#event-links", label: "Volunteer links" },
            { href: "#event-attendance-settings", label: "Attendance" },
            { href: "#event-advanced", label: "Advanced" },
          ]}
        />

        {errorMessage ? <div className="notice notice-error" role="alert">{errorMessage}</div> : null}
        <EventForm />
      </main>
    </div>
  );
}
