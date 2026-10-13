import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo";

import { RoleLanding } from "@/components/role-landing";
import { getLandingPageImage } from "@/lib/content/landing-page-media";

export const dynamic = "force-dynamic";

export const metadata: Metadata = publicPageMetadata({
  title: "Volunteer as a Coach in Singapore",
  description: "Support primary and secondary school students with MENDAKI's educational programmes. Explore opportunities to volunteer as a learning coach.",
  path: "/volunteer/coach",
});

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
