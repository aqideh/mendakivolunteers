import type { Metadata } from "next";

import { RoleLanding } from "@/components/role-landing";

export const metadata: Metadata = {
  title: "Volunteer as a Coach",
  description: "Explore MENDAKI Achievement Programme Coach roles.",
};

export default function CoachPage() {
  return (
    <RoleLanding
      title="Coach with the MENDAKI Achievement Programme."
      description="Coach roles are for volunteers who want to help participants strengthen skills, confidence, habits, and performance through structured engagement."
      items={[
        {
          title: "MENDAKI Achievement Programme Coach",
          description:
            "Support participants through structured activities, encouragement, and guided learning.",
        },
        {
          title: "Help build confidence",
          description:
            "Create a positive environment where participants can practise, improve, and recognise their progress.",
        },
        {
          title: "Support sustained progress",
          description:
            "Work within the programme structure and help participants stay engaged over time.",
        },
      ]}
      ctas={[
        {
          href: "/volunteer/interest?area=coach",
          label: "Volunteer",
        },
      ]}
    />
  );
}
