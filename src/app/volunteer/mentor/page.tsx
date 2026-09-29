import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { PortalHeader } from "@/components/portal-header";
import { getLandingPageImage } from "@/lib/content/landing-page-media";

import styles from "./mentor.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Volunteer as a Mentor",
  description:
    "Share your experience and build supportive relationships with youths. Help young people recognise their strengths, explore opportunities and set meaningful goals. Through ongoing conversations and activities, encourage them to take confident steps towards their future.",
};

const mekarPathways = [
  {
    className: styles.mekarCardGreen,
    glyph: "✿",
    title: "MEKAR Diri",
    subtitle: "Strengthening self",
    description: "Build confidence, motivation and resilience to thrive.",
    opportunities: (
      <>
        #amPowered Mentoring
        <br />
        PEER Mentoring
      </>
    ),
  },
  {
    className: styles.mekarCardBlue,
    glyph: "✧",
    title: "MEKAR Belia",
    subtitle: "Aspiring & discovering",
    description: "Discover strengths, explore aspirations and open possibilities.",
    opportunities: (
      <>
        MEKAR Belia Mentoring
        <br />
        <small>Sec 1–JC/Poly</small>
      </>
    ),
  },
  {
    className: styles.mekarCardPurple,
    glyph: "▣",
    title: "MEKAR Kerjaya",
    subtitle: "Navigating opportunities",
    description: "Make informed choices and access career opportunities.",
    opportunities: (
      <>
        MARA Mentoring
        <br />
        Flash Mentoring
      </>
    ),
  },
  {
    className: styles.mekarCardOrange,
    glyph: "⚑",
    title: "MEKAR Kepimpinan",
    subtitle: "Leading & contributing",
    description: "Grow as leaders and contribute to a stronger community.",
    opportunities: <>TUNAS Mentoring</>,
  },
];

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
                  Share your experience and build supportive relationships with youths.
                  Help young people recognise their strengths, explore opportunities and
                  set meaningful goals. Through ongoing conversations and activities,
                  encourage them to take confident steps towards their future.
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

        <section className={styles.mekar} id="mekar" aria-labelledby="mekar-title">
          <div className={styles.mekarHeader}>
            <p className={styles.mekarKicker}>The MENDAKI mentoring framework</p>
            <h2 id="mekar-title">
              A place for every
              <br />
              journey to <span>MEKAR.</span>
            </h2>
          </div>

          <div className={styles.mekarBar}>
            <div className={styles.mekarBarLead}>
              <span className={styles.mekarBarIcon} aria-hidden="true">
                ✦
              </span>
              <div>
                <strong>At the heart of every journey</strong>
                <span>
                  <b>Trust</b> · Guidance · Connection
                </span>
              </div>
            </div>
            <p>
              MEKAR helps match the right mentor, the right stage, and the right
              outcome. Explore the ways mentoring can help someone grow.
            </p>
          </div>

          <div className={styles.mekarCards}>
            {mekarPathways.map((pathway) => (
              <article
                className={`${styles.mekarCard} ${pathway.className}`}
                key={pathway.title}
              >
                <div className={styles.mekarGlyph} aria-hidden="true">
                  {pathway.glyph}
                </div>
                <h3>{pathway.title}</h3>
                <h4>{pathway.subtitle}</h4>
                <p>{pathway.description}</p>
                <div className={styles.mekarPrograms}>
                  <span>Mentoring opportunities</span>
                  <strong>{pathway.opportunities}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
