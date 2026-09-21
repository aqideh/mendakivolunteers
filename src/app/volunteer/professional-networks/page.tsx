import type { Metadata } from "next";

import { RoleLanding } from "@/components/role-landing";

export const metadata: Metadata = {
  title: "Professional Networks",
  description: "Explore professional network volunteering with MENDAKI.",
};

export default function ProfessionalNetworksPage() {
  return (
    <RoleLanding
      title="Connect expertise, networks, and community impact."
      description="Professional Networks provides a pathway for volunteers who want to contribute through their professional experience, industry connections, and knowledge."
      items={[
        {
          title: "Share knowledge",
          description:
            "Contribute perspectives and expertise that can support community learning and development.",
        },
        {
          title: "Build connections",
          description:
            "Help strengthen links between professionals, communities, and opportunities.",
        },
        {
          title: "Contribute through your field",
          description:
            "Take part in initiatives where professional experience and networks can add value.",
        },
      ]}
      ctas={[
        {
          href: "https://mendaki-pn-connect.base44.app/Home",
          label: "MENDAKI PN Connect",
        },
      ]}
    />
  );
}
