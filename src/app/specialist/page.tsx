import type { Metadata } from "next";

import { RoleLanding } from "@/components/role-landing";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getLandingPageImage } from "@/lib/content/landing-page-media";
import { getPublishedProfessionalEvents } from "@/lib/content/professional-events";

import { ProfessionalNetworkTabs } from "./professional-network-tabs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Specialist | Keluarga MENDAKI",
  description:
    "Join a community of specialists who connect, share knowledge and give back through MENDAKI's Professional Networks.",
};

function eventDateLabel(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "Date to be announced";
  if (!endsAt) return formatSingaporeDateTime(startsAt);
  return `${formatSingaporeDateTime(startsAt)} – ${formatSingaporeDateTime(endsAt)}`;
}

export default async function SpecialistPage() {
  const [heroImage, events] = await Promise.all([
    getLandingPageImage("specialist"),
    getPublishedProfessionalEvents(),
  ]);

  const eventCards = events.map((event) => ({
    id: event.id,
    title: event.title,
    summary: event.summary,
    dateLabel: eventDateLabel(event.starts_at, event.ends_at),
    venue: event.venue,
    ctaLabel: event.cta_label,
    ctaUrl: event.cta_url,
  }));

  return (
    <RoleLanding
      title="Your Experience Can Open Doors"
      description="Join a community of specialists who connect, share knowledge and give back. Support events and initiatives, share your experience, or simply get involved and build connections with others in your industry."
      heroImage={heroImage}
      items={[]}
      ctas={[{ href: "https://form.gov.sg/6ab08df24e9cff0f3ac1af45", label: "Join MENDAKI PN" }]}
      afterContent={<ProfessionalNetworkTabs events={eventCards} />}
    />
  );
}
