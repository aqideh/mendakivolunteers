import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";

import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "KELUARGA — Volunteer with MENDAKI",
  description:
    "Find your place to contribute with MENDAKI through mentoring, coaching, facilitation, specialist support, and community volunteering.",
};

const volunteerPaths = [
  {
    number: "01",
    title: "Mentor",
    description: "Guide someone over time through encouragement and shared experience.",
    href: "/volunteer/mentor",
  },
  {
    number: "02",
    title: "Coach",
    description: "Help people build skills, confidence, and performance.",
    href: "/volunteer/coach",
  },
  {
    number: "03",
    title: "Facilitator",
    description: "Create engaging learning, discussion, and group experiences.",
    href: "/volunteer/facilitator",
  },
  {
    number: "04",
    title: "Specialist",
    description: "Contribute professional or technical expertise where it matters.",
    href: "/volunteer/specialist",
  },
  {
    number: "05",
    title: "Contributor",
    description: "Support events and community activities through hands-on help.",
    href: "/opportunities",
  },
];

const outcomes = [
  "Confident Learners",
  "Stronger Families",
  "Future Ready Workforce",
  "Thriving Community",
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
            <p className={styles.lede}>
              Five ways to get started. Find the role that best matches how you want
              to contribute.
            </p>
          </div>

          <div className={styles.pathPrompt}>
            <p>I want to volunteer as a:</p>
          </div>

          <div className={styles.roleGrid} aria-label="Volunteering categories">
            {volunteerPaths.map(({ number, title, description, href }) => (
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
                <p className={styles.roleDescription}>{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.impact} aria-labelledby="impact-title">
          <div className={styles.impactHeading}>
            <p className="eyebrow">Our shared purpose</p>
            <h2 id="impact-title">Together, we work towards</h2>
          </div>

          <div className={styles.outcomes} aria-label="MENDAKI community outcomes">
            {outcomes.map((label) => (
              <div className={styles.outcomeItem} key={label}>
                <span className={styles.outcomeMarker} aria-hidden="true" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
