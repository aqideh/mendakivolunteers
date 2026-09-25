import type { Metadata } from "next";

import { RoleLanding } from "@/components/role-landing";
import { getLandingPageImage } from "@/lib/content/landing-page-media";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Volunteer as a Facilitator",
  description:
    "Empower parents of children to support learning at home through practical play based tips, interactive workshops, hands on activities and resources that build their confidence.",
};

export default async function FacilitatorPage() {
  const heroImage = await getLandingPageImage("facilitator");

  return (
    <RoleLanding
      title="Inspire Learning. Build Confidence."
      description="Empower parents of children to support learning at home through practical play based tips, interactive workshops, hands on activities and resources that build their confidence."
      heroImage={heroImage}
      heroPosition="72% center"
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
      ctas={[{ href: "https://form.gov.sg/6ab08df24e9cff0f3ac1af45", label: "Volunteer" }]}
    />
  );
}
