import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";

import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Keluarga MENDAKI — Volunteer with MENDAKI",
  description:
    "Find your place to contribute with MENDAKI through mentoring, coaching, facilitation, specialist support, and community volunteering.",
};

const volunteerPaths = [
  {
    number: "01",
    title: "Mentor",
    href: "/volunteer/mentor",
  },
  {
    number: "02",
    title: "Coach",
    href: "/volunteer/coach",
  },
  {
    number: "03",
    title: "Facilitator",
    href: "/volunteer/facilitator",
  },
  {
    number: "04",
    title: "Specialist",
    href: "/volunteer/specialist",
  },
  {
    number: "05",
    title: "Contributor",
    href: "/opportunities",
  },
];


export default function Home() {
  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className={`phaseone-frame ${styles.frame}`}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Volunteer with MENDAKI</p>
            <h1 id="landing-title">
              Make a Difference In <span>Your Community</span>
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
                  <span className={styles.roleArrow} aria-hidden="true">
                    ↗
                  </span>
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
