import type { Metadata } from "next";

import { RoleLanding } from "@/components/role-landing";

export const metadata: Metadata = {
  title: "Volunteer as a Mentor",
  description: "Explore mentoring roles with MENDAKI.",
};

export default function MentorPage() {
  return (
    <RoleLanding
      eyebrow="Mentor"
      title="Be a steady guide in someone's journey."
      description="Mentoring is for volunteers who want to build meaningful, ongoing relationships and support others through encouragement, guidance, and shared experience."
      items={[
        {
          title: "Build connection",
          description:
            "Create a consistent and supportive relationship with participants over time.",
        },
        {
          title: "Guide growth",
          description:
            "Encourage reflection, confidence, and progress through regular engagement.",
        },
        {
          title: "Show up consistently",
          description:
            "Mentoring works best when volunteers are ready to commit to the journey, not just a single activity.",
        },
      ]}
      ctas={[
        {
          href: "/volunteer/interest?role=mentor",
          label: "Register your interest",
        },
      ]}
    />
  );
}
