import type { Metadata } from "next";

import { RoleLanding } from "@/components/role-landing";

export const metadata: Metadata = {
  title: "Volunteer as a Specialist",
  description: "Contribute professional or specialist expertise with MENDAKI.",
};

export default function SpecialistPage() {
  return (
    <RoleLanding
      eyebrow="Specialist"
      title="Put your expertise to work for the community."
      description="Specialist volunteering is for people who want to contribute professional, technical, industry, or subject-matter expertise in ways that complement MENDAKI's programmes and community work."
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
      ctas={[
        {
          href: "/volunteer/professional-networks",
          label: "Explore Professional Networks",
        },
        {
          href: "/volunteer/specialist-interest",
          label: "Share your specialist skills",
          secondary: true,
        },
      ]}
    />
  );
}
