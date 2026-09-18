import type { Metadata } from "next";

import { RoleLanding } from "@/components/role-landing";

export const metadata: Metadata = {
  title: "Volunteer as a Facilitator",
  description:
    "Explore ReadySetLearn Language Explorer, Math Explorer, and Befriender roles.",
};

export default function FacilitatorPage() {
  return (
    <RoleLanding
      eyebrow="Facilitator"
      title="Create engaging experiences for participants."
      description="Facilitator roles are for volunteers who enjoy working directly with groups, guiding activities, and helping participants feel engaged and supported."
      items={[
        {
          title: "ReadySetLearn Language Explorer",
          description:
            "Support language-focused sessions and help participants engage confidently with activities.",
        },
        {
          title: "ReadySetLearn Math Explorer",
          description:
            "Support numeracy and problem-solving activities through guided, structured sessions.",
        },
        {
          title: "Befrienders",
          description:
            "Build rapport with participants and help create a welcoming, supportive experience.",
        },
      ]}
      ctas={[
        {
          href: "/volunteer/interest?role=facilitator",
          label: "Register your interest",
        },
      ]}
    />
  );
}
