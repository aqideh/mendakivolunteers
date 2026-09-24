import type { Metadata } from "next";

import { RoleLanding } from "@/components/role-landing";

export const metadata: Metadata = {
  title: "Volunteer as a Coach",
  description:
    "Guide primary and secondary students in their learning journey by providing quality academic support, building their confidence and equipping them to succeed in school and beyond.",
};

export default function CoachPage() {
  return (
    <RoleLanding
      title="Coaching Every Learner Forward."
      description="Guide primary and secondary students in their learning journey by providing quality academic support, building their confidence and equipping them to succeed in school and beyond."
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
