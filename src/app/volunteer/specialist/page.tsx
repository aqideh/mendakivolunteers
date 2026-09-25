import type { Metadata } from "next";

import { RoleLanding } from "@/components/role-landing";
import { getLandingPageImage } from "@/lib/content/landing-page-media";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Volunteer as a Specialist",
  description:
    "Connecting professionals across industries to share knowledge, grow together, and build meaningful networks. Be part of a community that empowers your career.",
};

export default async function SpecialistPage() {
  const heroImage = await getLandingPageImage("specialist");

  return (
    <RoleLanding
      title="Connect Professionals & Grow Possibilities."
      description="Connecting professionals across industries to share knowledge, grow together, and build meaningful networks. Be part of a community that empowers your career."
      heroImage={heroImage}
      inlineCta={{
        href: "https://professionalnetworksuat.mendaki.org.sg/",
        label: "Discover Professional Networks",
      }}
      items={[
        {
          title: "Professional Networks",
          description:
            "Explore opportunities to contribute through professional communities, knowledge-sharing, and network-based initiatives.",
        },
        {
          title: "Specialist volunteering",
          description:
            "Tell us about your expertise so we can identify future opportunities where your skills may be useful.",
        },
        {
          title: "Skills-based contribution",
          description:
            "Support work that benefits from specific professional, technical, or specialist capabilities.",
        },
      ]}
      ctas={[{ href: "https://form.gov.sg/6ab08df24e9cff0f3ac1af45", label: "Volunteer" }]}
    />
  );
}
