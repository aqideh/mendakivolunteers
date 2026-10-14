import type { Metadata } from "next";

export const SITE_URL = "https://keluarga.mendaki.org.sg";
export const SEO_IMAGE_PATH = "/opengraph-image";

export function absoluteSiteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

export function publicPageMetadata({
  title,
  description,
  path,
}: Readonly<{ title: string; description: string; path: string }>): Metadata {
  const fullTitle = title + " | Keluarga MENDAKI";
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: fullTitle,
      description,
      url: absoluteSiteUrl(path),
      siteName: "Keluarga MENDAKI",
      locale: "en_SG",
      type: "website",
      images: [{
        url: SEO_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: "Keluarga MENDAKI — volunteer opportunities in Singapore",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [SEO_IMAGE_PATH],
    },
  };
}

export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function hasUpcomingTimeslot(
  timeslots: ReadonlyArray<{ starts_at: string; ends_at: string | null }>,
  now = new Date(),
): boolean {
  const nowMs = now.getTime();
  return timeslots.some((slot) => {
    const endMs = Date.parse(slot.ends_at ?? slot.starts_at);
    return Number.isFinite(endMs) && endMs >= nowMs;
  });
}

export const EDITABLE_SEO_PAGES = [
  {
    "path": "/",
    "label": "Home",
    "title": "Volunteer in Singapore",
    "description": "Volunteer with Yayasan MENDAKI in Singapore. Explore coaching, facilitation, youth mentoring, community events and professional volunteering opportunities."
  },
  {
    "path": "/opportunities",
    "label": "Community opportunities",
    "title": "Volunteer Opportunities in Singapore",
    "description": "Find upcoming MENDAKI volunteer opportunities in Singapore. Contribute at community events and register for suitable volunteering shifts."
  },
  {
    "path": "/volunteer/coach",
    "label": "Coach",
    "title": "Volunteer as a Coach in Singapore",
    "description": "Support primary and secondary school students with MENDAKI's educational programmes. Explore opportunities to volunteer as a learning coach."
  },
  {
    "path": "/volunteer/facilitator",
    "label": "Facilitator",
    "title": "Volunteer as a Facilitator in Singapore",
    "description": "Help families learn together through MENDAKI's parent and child learning programmes. Explore volunteer facilitator and befriender roles."
  },
  {
    "path": "/volunteer/mentor",
    "label": "Mentor",
    "title": "Volunteer as a Youth Mentor in Singapore",
    "description": "Become a youth mentor with MENDAKI. Support young people in Singapore through mentoring, confidence-building and career exploration."
  },
  {
    "path": "/specialist",
    "label": "Professional Networks",
    "title": "Join MENDAKI Professional Networks",
    "description": "Connect with MENDAKI Professional Networks in Singapore. Share your expertise, build professional connections and contribute to the community."
  },
  {
    "path": "/faq",
    "label": "FAQs",
    "title": "Volunteer FAQs",
    "description": "Find answers to common questions about volunteering, registration and getting involved with Keluarga MENDAKI in Singapore."
  },
  {
    "path": "/news",
    "label": "Volunteer news",
    "title": "MENDAKI Volunteer News",
    "description": "Read updates and announcements for MENDAKI volunteers in Singapore."
  }
] as const;

export type EditableSeoPath = (typeof EDITABLE_SEO_PAGES)[number]["path"];

export function findEditableSeoPage(path: string) {
  return EDITABLE_SEO_PAGES.find((page) => page.path === path);
}
