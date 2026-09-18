import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";

import styles from "../role-landing.module.css";

export const metadata: Metadata = {
  title: "Volunteer Interest",
};

export default function VolunteerInterestPage() {
  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className={styles.frame}>
        <Link className={styles.backLink} href="/">
          ← Back to volunteering roles
        </Link>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Volunteer interest</p>
          <h1>Tell us how you would like to contribute.</h1>
          <p className={styles.lede}>
            This is where the general volunteer signup and data collection form will live.
            We will build the form next.
          </p>
        </section>
      </main>
    </div>
  );
}
