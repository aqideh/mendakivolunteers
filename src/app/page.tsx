import type { Metadata } from "next";

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
  },
  {
    number: "02",
    title: "Coach",
    description: "Help people build skills, confidence, and performance.",
  },
  {
    number: "03",
    title: "Facilitator",
    description: "Create engaging learning, discussion, and group experiences.",
  },
  {
    number: "04",
    title: "Specialist",
    description: "Contribute professional or technical expertise where it matters.",
  },
  {
    number: "05",
    title: "Contributor",
    description: "Support events and community activities through hands-on help.",
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
              Choose how you want to <span>make a difference.</span>
            </h1>
            <p className={styles.lede}>
              Five ways to get started. Find the role that best matches how you want
              to contribute.
            </p>
          </div>

          <div className={styles.pathPrompt}>
            <p>Choose your starting point</p>
            <span>Select the role that feels closest to you.</span>
          </div>

          <div className={styles.roleGrid} aria-label="Volunteering categories">
            {volunteerPaths.map(({ number, title, description }) => (
              <button className={styles.roleOption} key={title} type="button">
                <span className={styles.roleNumber}>{number}</span>
                <span className={styles.roleCopy}>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </span>
                <span className={styles.roleArrow} aria-hidden="true">
                  →
                </span>
              </button>
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
