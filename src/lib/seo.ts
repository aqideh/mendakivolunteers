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
