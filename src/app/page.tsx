import type { Metadata } from "next";
import Link from "next/link";

import { CountUpStat } from "@/components/phaseone/count-up-stat";
import { PortalHeader } from "@/components/portal-header";
import { getUpcomingPhaseOneOpportunities } from "@/lib/phaseone/opportunities";

import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "KELUARGA — Volunteer with MENDAKI",
  description:
    "Discover MENDAKI volunteer opportunities with KELUARGA and make a difference in your community.",
};

export const dynamic = "force-dynamic";

const outcomes = [
  { emoji: "🎓", label: "Confident Learners" },
  { emoji: "🏠", label: "Stronger Families" },
  { emoji: "💼", label: "Future Ready Workforce" },
  { emoji: "🌱", label: "Thriving Community" },
];

const steps = [
  {
    number: "01",
    title: "Discover",
    description: "Browse current opportunities that match your time and interests.",
  },
  {
    number: "02",
    title: "Register",
    description:
      "Continue to the official registration portal. It uses a separate sign-in from KELUARGA.",
  },
  {
    number: "03",
    title: "Prepare and volunteer",
    description:
      "Sign in to KELUARGA to open the Event Guide for activities you are registered for.",
  },
];

export default async function Home() {
  const opportunities = await getUpcomingPhaseOneOpportunities();

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className={`phaseone-frame ${styles.frame}`}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Volunteer with MENDAKI</p>
            <h1 id="landing-title">
              <span>Make A Difference</span>
              <span>In Your Community.</span>
            </h1>
            <p className={styles.lede}>
              Discover meaningful opportunities, stay informed, and contribute to
              outcomes that strengthen our community.
            </p>

            <div className={styles.actions}>
              <Link className="button button-primary" href="/opportunities">
                Explore opportunities
              </Link>
              <Link className="button button-secondary" href="/journey">
                Open Event Guide
              </Link>
            </div>

            <CountUpStat
              className={styles.opportunityStat}
              value={opportunities.length}
              label="Active volunteer opportunities"
            />
          </div>

          <div className={styles.outcomePanel}>
            <p className={styles.outcomeKicker}>Together, we work towards</p>
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
          </div>
        </section>

        <section className={styles.path} aria-labelledby="landing-path-title">
          <div className={styles.pathHeading}>
            <p className="eyebrow">How it works</p>
            <h2 id="landing-path-title">Your next opportunity is a few taps away.</h2>
          </div>
          <div className={styles.pathGrid}>
            {steps.map(({ number, title, description }) => (
              <article className={styles.pathStep} key={number}>
                <span className={styles.pathNumber}>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
