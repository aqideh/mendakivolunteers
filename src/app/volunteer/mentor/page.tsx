import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";

import styles from "./mentor.module.css";

export const metadata: Metadata = {
  title: "Volunteer as a Mentor",
  description: "Helping potential bloom through meaningful mentoring with MENDAKI.",
};

export default function MentorPage() {
  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className={styles.frame}>
        <Link className={styles.backLink} href="/">
          <span aria-hidden="true">←</span>
          <span>Back to volunteering roles</span>
        </Link>

        <section className={styles.hero} aria-labelledby="mentor-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Mentor</p>
            <h1 id="mentor-title">
              Helping Potential Bloom Through Meaningful Mentoring
            </h1>
            <p className={styles.lede}>
              The right mentor. The right stage. For the right outcome.
            </p>
            <Link
              className={styles.primaryAction}
              href="/volunteer/interest?role=mentor"
            >
              <span>Register your interest</span>
              <span aria-hidden="true">↗</span>
            </Link>
          </div>

          <div className={styles.heroImage}>
            <Image
              alt="Two people working together at a desk"
              height={326}
              priority
              src="/volunteer/mentor/mendaki-ampowered.png"
              unoptimized
              width={497}
            />
          </div>
        </section>

        <section className={styles.mekar} aria-labelledby="mekar-title">
          <p className={styles.sectionEyebrow}>Mentoring framework</p>
          <h2 id="mekar-title">MEKAR: MENDAKI Mentoring Framework</h2>
        </section>
      </main>
    </div>
  );
}
