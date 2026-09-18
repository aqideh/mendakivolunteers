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
    description: "Build an ongoing relationship and guide someone's growth.",
  },
  {
    number: "02",
    title: "Coach",
    description: "Help someone strengthen a skill, habit, or performance.",
  },
  {
    number: "03",
    title: "Facilitator",
    description: "Lead activities, discussions, and group learning.",
  },
  {
    number: "04",
    title: "Specialist",
    description: "Contribute professional, technical, or subject expertise.",
  },
  {
    number: "05",
    title: "Contributor",
    description: "Lend a hand at events, activities, and community efforts.",
  },
];

const outcomes = [
  { emoji: "🎓", label: "Confident Learners" },
  { emoji: "🏠", label: "Stronger Families" },
  { emoji: "💼", label: "Future Ready Workforce" },
  { emoji: "🌱", label: "Thriving Community" },
];

export default function Home() {
  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className={`phaseone-frame ${styles.frame}`}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Start your volunteering journey</p>
            <h1 id="landing-title">
              Choose how you want to <span>make a difference.</span>
            </h1>
            <p className={styles.lede}>
              Start with the role that feels closest to how you want to contribute.
            </p>
          </div>

          <div className={styles.pathPrompt}>
            <p>Which sounds most like you?</p>
            <span>Choose one to begin.</span>
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
            {outcomes.map(({ emoji, label }) => (
              <div className={styles.outcomePill} key={label}>
                <span className={styles.outcomeEmoji} aria-hidden="true">
                  {emoji}
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
