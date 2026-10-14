import type { Metadata } from "next";
import { getEditablePageMetadata } from "@/lib/seo-content";
import Link from "next/link";
import type { CSSProperties } from "react";

import { PortalHeader } from "@/components/portal-header";
import { getLandingPageImage } from "@/lib/content/landing-page-media";
import { getUpcomingPhaseOneOpportunities, type KeluargaOpportunity } from "@/lib/phaseone/opportunities";
import CommunityToast, { type CommunityToastProps } from "./community-toast";

import { jsonLd, SITE_URL } from "@/lib/seo";

import styles from "./landing.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return getEditablePageMetadata("/");
}

const volunteerPaths = [
  { title: "Coach", href: "/volunteer/coach" },
  { title: "Facilitator", href: "/volunteer/facilitator" },
  { title: "Mentor", href: "/volunteer/mentor" },
  { title: "Contributor", href: "/opportunities" },
  { title: "Join Professional Networks", href: "/specialist" },
];


// A reviewed Malay translation can be added alongside this English copy.
// Do not automatically translate public-facing volunteer recruitment copy.
type CopyVariant = "default" | "belonging" | "social-proof";
const COPY_VARIANT: CopyVariant = "default";

function singaporeShortDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(value));
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${day} ${month}`;
}

function getToastCopy(
  events: KeluargaOpportunity[],
  variant: CopyVariant = COPY_VARIANT,
): Pick<CommunityToastProps, "message" | "cta" | "href"> | null {
  const event = events[0];
  if (!event) return null;
  if (events.length > 1) {
    return {
      message: `${events.length} upcoming events need volunteers.`,
      cta: "See events",
      href: "/opportunities",
    };
  }

  const date = singaporeShortDate(event.starts_at);
  const deadline = event.registration_deadline;
  const isFutureDeadline =
    Boolean(deadline) &&
    Number.isFinite(new Date(deadline!).getTime()) &&
    new Date(deadline!).getTime() > Date.now();

  let message = `${event.title} needs volunteers on ${date}.`;
  if (isFutureDeadline && deadline) {
    message += ` Sign up by ${singaporeShortDate(deadline)}.`;
  }

  if (variant === "belonging") {
    message = `Join your Keluarga at ${event.title} on ${date}.`;
  }
  if (variant === "social-proof") {
    // Stub only: when verified participant counts are supplied, test copy here.
    // Until then, retain the factual default; never invent a volunteer count.
  }

  return {
    message,
    cta: "See how to help",
    href: `/opportunities/${encodeURIComponent(event.slug)}`,
  };
}

async function getCommunityToast(): Promise<CommunityToastProps | null> {
  try {
    const events = await getUpcomingPhaseOneOpportunities();
    const copy = getToastCopy(events);
    const first = events[0];
    if (!copy || !first) return null;

    // Include other titles so a replacement event also resets the dismissal.
    const storageKey = `keluarga-community-toast:${JSON.stringify([
      first.title,
      events.length - 1,
      ...events.slice(1).map((event) => event.title),
    ])}`;
    return { ...copy, storageKey };
  } catch {
    // A database outage must not affect the homepage.
    return null;
  }
}

export default async function Home() {
  const [heroImage, toast] = await Promise.all([
    getLandingPageImage("home"),
    getCommunityToast(),
  ]);

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Volunteers" lite />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "Yayasan MENDAKI", url: "https://www.mendaki.org.sg/" },
          { "@type": "WebSite", name: "Keluarga MENDAKI", url: SITE_URL,
            publisher: { "@type": "Organization", name: "Yayasan MENDAKI" } },
        ],
      }) }} />
      <main className={`phaseone-frame ${styles.frame}`}>
        <section
          className={styles.hero}
          aria-labelledby="landing-title"
          style={{ "--home-hero-image": `url("${heroImage}")` } as CSSProperties}
        >
          <div className={styles.heroCopy}>
            <h1 id="landing-title">
              Welcome to <span>Keluarga MENDAKI</span>
            </h1>
          </div>

          <div className={styles.pathPrompt}>
            <p>I want to volunteer as a:</p>
          </div>

          <div className={styles.roleGrid} aria-label="Volunteering categories">
            {volunteerPaths.map(({ title, href }) => (
              <div className={styles.roleChoice} key={title}>
                <Link className={styles.roleOption} href={href}>
                  <span className={styles.roleLabel}>
                    <strong>{title}</strong>
                  </span>
                  <span className={styles.roleArrow} aria-hidden="true">↗</span>
                </Link>
              </div>
            ))}
          </div>
        </section>
        {toast && <CommunityToast {...toast} />}
      </main>
      <footer className="site-footer">
        © 2026{" "}
        <a href="https://www.mendaki.org.sg/" target="_blank" rel="noreferrer">
          Yayasan MENDAKI
        </a>
      </footer>
    </div>
  );
}
