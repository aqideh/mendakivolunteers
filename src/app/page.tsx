import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { PortalHeader } from "@/components/portal-header";
import { getLandingPageImage } from "@/lib/content/landing-page-media";

import styles from "./landing.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Keluarga MENDAKI — Volunteer with MENDAKI",
  description:
    "Find your place to contribute with MENDAKI through coaching, facilitation, mentoring, professional support, and community volunteering.",
};

const volunteerPaths = [
  { number: "01", title: "Coach", href: "/volunteer/coach" },
  { number: "02", title: "Facilitator", href: "/volunteer/facilitator" },
  { number: "03", title: "Mentor", href: "/volunteer/mentor" },
  { number: "04", title: "Professional", href: "/volunteer/specialist" },
  { number: "05", title: "Contributor", href: "/opportunities" },
];

export default async function Home() {
  const heroImage = await getLandingPageImage("home");

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Volunteers" lite />
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
            {volunteerPaths.map(({ number, title, href }) => (
              <div className={styles.roleChoice} key={title}>
                <Link className={styles.roleOption} href={href}>
                  <span className={styles.roleLabel}>
                    <span className={styles.roleNumber}>{number}</span>
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
