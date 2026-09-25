import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { PortalHeader } from "@/components/portal-header";
import { getLandingPageImage } from "@/lib/content/landing-page-media";

import styles from "./mentor.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Volunteer as a Mentor",
  description:
    "#amPowered is a structured mentoring programme that helps Malay/Muslim youth aged 13 to 18 discover their strengths and maximise their potential.",
};

export default async function MentorPage() {
  const heroImage = await getLandingPageImage("mentor");

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Volunteers" lite />
      <main className={styles.frame}>
        <section
          className={styles.hero}
          aria-labelledby="mentor-title"
          style={{ "--mentor-hero-image": `url("${heroImage}")` } as CSSProperties}
        >
          <div className={styles.heroInner}>
            <Link className={styles.backLink} href="/">
              <span aria-hidden="true">←</span>
              <span>Back to volunteering roles</span>
            </Link>

            <div className={styles.heroContent}>
              <div className={styles.heroCopy}>
                <h1 id="mentor-title">Bloom Through Meaningful Mentoring.</h1>
                <p className={styles.lede}>
                  #amPowered is a structured mentoring programme that helps
                  Malay/Muslim youth aged 13 to 18 discover their strengths and
                  maximise their potential. Through guidance and meaningful
                  connections, youth are supported to remain in school, set goals,
                  explore education and career pathways, and build strong networks
                  for their future.
                </p>
              </div>

              <Link
                className={styles.primaryAction}
                href="https://form.gov.sg/6ab08df24e9cff0f3ac1af45"
              >
                <span>Volunteer</span>
                <span aria-hidden="true">↗</span>
              </Link>
            </div>
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
