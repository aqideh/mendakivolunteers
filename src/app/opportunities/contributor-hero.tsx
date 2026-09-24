"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

import styles from "./contributor-hero.module.css";

const states = [
  {
    key: "volunteer",
    title: "Serve with a Heart, One Keluarga.",
    description:
      "Join upcoming community activities and events that match your interests and availability. Contribute your time through practical volunteer roles that support programme delivery.",
    background: "/home/keluarga-volunteers-hero.jpeg",
  },
  {
    key: "contribute",
    title: "Transform Ideas into Community Impact",
    description:
      "Have an idea that benefits MENDAKI volunteers? Individuals, community groups, and organisations are welcome to propose projects that enhance volunteers' skills, well-being, recognition, or overall volunteering experience.",
    background: "/home/keluarga-volunteers-hero.jpeg",
  },
  {
    key: "donate",
    title: "Every Gift Creates Impact",
    description:
      "Your contribution supports MENDAKI's efforts to uplift individuals and families through education and community programmes. Every donation helps create opportunities, empower aspirations and build brighter futures for the Malay/Muslim community.",
    background: "/volunteer/mentor/mendaki-ampowered.png",
  },
] as const;

const ctas = [
  {
    key: "volunteer",
    label: "Volunteer",
    href: "https://form.gov.sg/6ab08df24e9cff0f3ac1af45",
  },
  {
    key: "contribute",
    label: "Contribute",
    href: "https://form.gov.sg/6ab08df24e9cff0f3ac1af45",
  },
  {
    key: "donate",
    label: "Donate",
    href: "https://www.mendaki.org.sg/campaign-listing",
  },
] as const;

export function ContributorHero() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % states.length);
    }, 8000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className={styles.hero} aria-labelledby="contributor-hero-title">
      <div className={styles.heroBackgrounds} aria-hidden="true">
        {states.map((state, index) => (
          <div
            className={
              index === activeIndex
                ? `${styles.heroBackground} ${styles.heroBackgroundActive}`
                : styles.heroBackground
            }
            key={state.key}
            style={{ "--state-image": `url("${state.background}")` } as CSSProperties}
          />
        ))}
      </div>

      <div className={styles.heroInner}>
        <Link className={styles.backLink} href="/">
          <span aria-hidden="true">←</span>
          <span>Back to volunteering roles</span>
        </Link>

        <div className={styles.heroContent}>
          <div className={styles.heroCopy}>
            {states.map((state, index) => {
              const isActive = index === activeIndex;

              return (
                <div
                  aria-hidden={!isActive}
                  className={
                    isActive
                      ? `${styles.heroCopyState} ${styles.heroCopyStateActive}`
                      : styles.heroCopyState
                  }
                  key={state.key}
                >
                  <h1 id={isActive ? "contributor-hero-title" : undefined}>
                    {state.title}
                  </h1>
                  <p>{state.description}</p>
                </div>
              );
            })}
          </div>

          <div className={styles.heroActions} aria-label="Ways to contribute">
            {ctas.map((cta) => {
              const highlighted = cta.key === states[activeIndex]?.key;
              const className = highlighted
                ? styles.primaryAction
                : styles.secondaryAction;

              if (cta.href.startsWith("#")) {
                return (
                  <a className={className} href={cta.href} key={cta.key}>
                    <span>{cta.label}</span>
                    <span aria-hidden="true">↓</span>
                  </a>
                );
              }

              if (cta.href.startsWith("http")) {
                return (
                  <a
                    className={className}
                    href={cta.href}
                    key={cta.key}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{cta.label}</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                );
              }

              return (
                <Link className={className} href={cta.href} key={cta.key}>
                  <span>{cta.label}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className={styles.pagination} aria-label="Contributor hero slides">
          {states.map((state, index) => (
            <button
              aria-label={`Show ${state.title}`}
              aria-pressed={index === activeIndex}
              className={styles.paginationDot}
              key={state.key}
              onClick={() => setActiveIndex(index)}
              type="button"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
