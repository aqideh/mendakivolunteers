import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/", "/admin", "/staff", "/dashboard", "/account", "/attendance",
        "/auth", "/onboarding", "/login", "/set-password", "/profile",
        "/journey", "/points", "/pathways", "/volunteer/interest",
        "/volunteer/specialist-interest",
      ],
    }],
    sitemap: SITE_URL + "/sitemap.xml",
    host: SITE_URL,
  };
}
