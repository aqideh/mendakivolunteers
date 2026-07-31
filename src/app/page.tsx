import type { Metadata } from "next";
import Link from "next/link";

import { CountUpStat } from "@/components/phaseone/count-up-stat";
import { PortalHeader } from "@/components/portal-header";
import { getUpcomingPhaseOneOpportunities } from "@/lib/phaseone/opportunities";

import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Volunteer with MENDAKI",
  description:
    "Discover MENDAKI volunteer opportunities and make a difference in your community.",
};

export const dynamic = "force-dynamic";

const outcomes = [
  "Confident Learners",
  "Stronger Families",
  "Future Ready Workforce",
  "Thriving Community",
];

export default async function Home() {
  const opportunities = await getUpcomingPhaseOneOpportunities();

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className={`phaseone-frame ${styles.frame}`}>
        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.heroCopy}>
            <p className="eyebrow">Volunteer with MENDAKI</p>
            <h1 id="landing-title">Make A Difference In Your Community.</h1>
            <p className="lede">
              Find meaningful opportunities, access event updates, and take part in
              building a stronger community together.
            </p>
            <div className={styles.actions}>
              <Link className="button button-primary" href="/opportunities">
                Explore opportunities
              </Link>
              <Link className="button button-secondary" href="/login">
                Staff sign in
              </Link>
            </div>
          </div>

          <div className={styles.outcomes} aria-label="MENDAKI community outcomes">
            {outcomes.map((outcome) => (
              <p key={outcome}>{outcome}</p>
            ))}
          </div>
        </section>

        <section className={styles.statistics} aria-label="Volunteer statistics">
          <CountUpStat
            className={styles.statCard}
            value={opportunities.length}
            label="Active volunteer opportunities"
          />
          <article className={styles.statCard}>
            <strong>4</strong>
            <span>Community outcomes we work towards</span>
          </article>
        </section>

        <section className={styles.path} aria-labelledby="landing-path-title">
          <p className="eyebrow">Start here</p>
          <h2 id="landing-path-title">Your next opportunity is a few taps away.</h2>
          <div className="card-grid">
            <article className="card">
              <h3>Discover</h3>
              <p className="muted">
                Browse current opportunities that match your time and interests.
              </p>
            </article>
            <article className="card">
              <h3>Volunteer</h3>
              <p className="muted">
                Register securely and receive the details needed for the event.
              </p>
            </article>
            <article className="card">
              <h3>Stay updated</h3>
              <p className="muted">
                Access event briefings, sign-in and sign-out resources on-site.
              </p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
