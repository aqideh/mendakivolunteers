import type { Metadata } from "next";

import { RoleLanding } from "@/components/role-landing";
import { getLandingPageImage } from "@/lib/content/landing-page-media";

export const metadata: Metadata = {
  title: "Volunteer as a Coach",
  description:
    "Guide primary and secondary students in their learning journey by providing quality academic support, building their confidence and equipping them to succeed in school and beyond.",
};

export default async function CoachPage() {
  const heroImage = await getLandingPageImage("coach");

  return (
    <RoleLanding
      title="Coaching Every Learner Forward."
      description="Guide primary and secondary students in their learning journey by providing quality academic support, building their confidence and equipping them to succeed in school and beyond."
      heroImage={heroImage}
      heroPosition="67% center"
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
      ctas={[{ href: "https://form.gov.sg/6ab08df24e9cff0f3ac1af45", label: "Volunteer" }]}
    />
  );
}
