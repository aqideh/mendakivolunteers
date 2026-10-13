import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { PortalHeader } from "@/components/portal-header";
import { getLandingPageImage } from "@/lib/content/landing-page-media";

import { publicPageMetadata, jsonLd, SITE_URL } from "@/lib/seo";

import styles from "./landing.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = publicPageMetadata({
  title: "Volunteer in Singapore",
  description: "Volunteer with Yayasan MENDAKI in Singapore. Explore coaching, facilitation, youth mentoring, community events and professional volunteering opportunities.",
  path: "/",
});

const volunteerPaths = [
  { title: "Coach", href: "/volunteer/coach" },
  { title: "Facilitator", href: "/volunteer/facilitator" },
  { title: "Mentor", href: "/volunteer/mentor" },
  { title: "Contributor", href: "/opportunities" },
  { title: "Join Professional Networks", href: "/specialist" },
];

export default async function Home() {
  const heroImage = await getLandingPageImage("home");

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
