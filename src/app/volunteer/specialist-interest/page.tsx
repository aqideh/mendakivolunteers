import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";

import styles from "../role-landing.module.css";

export const metadata: Metadata = {
  title: "Specialist Volunteer Interest",
};

export default function SpecialistInterestPage() {
  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className={styles.frame}>
        <Link className={styles.backLink} href="/volunteer/specialist">
          ← Back to Specialist
        </Link>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Specialist volunteering</p>
          <h1>Share your skills and expertise.</h1>
          <p className={styles.lede}>
            This is where the specialist volunteer data collection form will live.
            We will build the form next.
          </p>
        </section>
      </main>
    </div>
  );
}
