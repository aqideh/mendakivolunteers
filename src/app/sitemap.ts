import type { MetadataRoute } from "next";

import { getPublicNewsPosts } from "@/lib/content/public-news";
import { professionalNetworks } from "@/lib/content/professional-networks";
import { getUpcomingPhaseOneOpportunities } from "@/lib/phaseone/opportunities";
import { absoluteSiteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [opportunities, news] = await Promise.all([
    getUpcomingPhaseOneOpportunities(),
    getPublicNewsPosts(),
  ]);

  const publicPaths = [
    "/", "/opportunities", "/volunteer/coach", "/volunteer/facilitator",
    "/volunteer/mentor", "/specialist", "/faq", "/news",
  ];

  return [
    ...publicPaths.map((path) => ({
      url: absoluteSiteUrl(path),
      changeFrequency: "weekly" as const,
      priority: path === "/" ? 1 : 0.7,
    })),
    ...professionalNetworks.map((network) => ({
      url: absoluteSiteUrl("/specialist/networks/" + encodeURIComponent(network.slug)),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...opportunities.map((opportunity) => ({
      url: absoluteSiteUrl("/opportunities/" + encodeURIComponent(opportunity.slug)),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...news.map((post) => ({
      url: absoluteSiteUrl("/news/" + encodeURIComponent(post.slug)),
      lastModified: post.published_at ?? post.publish_at ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
