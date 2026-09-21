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
        <section className={styles.hero} aria-labelledby="mentor-title">
          <div className={styles.heroInner}>
            <Link className={styles.backLink} href="/">
              <span aria-hidden="true">←</span>
              <span>Back to volunteering roles</span>
            </Link>

            <div className={styles.heroCopy}>
            <h1 id="mentor-title">
              Helping Potential Bloom Through Meaningful Mentoring
            </h1>
              <p className={styles.lede}>
                The right mentor. The right stage. For the right outcome.
              </p>
            </div>

            <Link
              className={styles.primaryAction}
              href="https://form.gov.sg/6ab08df24e9cff0f3ac1af45"
            >
              <span>Register your interest</span>
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>

        <section className={styles.mekar} aria-labelledby="mekar-title">
          <div className={styles.mekarHeader}>
            <h2 id="mekar-title">MEKAR: MENDAKI Mentoring Framework</h2>
            <p className={styles.mekarIntro}>
              A mentoring journey designed to support growth at every stage — from
              self-discovery and aspiration-building to leadership and contribution.
            </p>
          </div>

          <div className={styles.mekarImageWrap}>
            <Image
              alt="MEKAR: MENDAKI Mentoring Framework"
              className={styles.mekarImage}
              height={554}
              src="/volunteer/mentor/mekar-framework.png"
              unoptimized
              width={821}
            />
          </div>
        </section>

      </main>
    </div>
  );
}
