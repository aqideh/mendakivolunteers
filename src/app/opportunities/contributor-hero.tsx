"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

import styles from "./contributor-hero.module.css";

const states = [
  {
    key: "specialist",
    title: "Contribute your expertise.",
    description:
      "Use your professional, technical, or specialist skills to support MENDAKI initiatives where your experience can make a focused difference.",
    background: "/home/keluarga-volunteers-hero.jpeg",
  },
  {
    key: "donate",
    title: "Support the community through giving.",
    description:
      "Contribute resources that help MENDAKI sustain programmes, opportunities, and support for the community.",
    background: "/volunteer/mentor/mendaki-ampowered.png",
  },
  {
    key: "volunteer",
    title: "Volunteer where help is needed.",
    description:
      "Join upcoming community activities and events, and contribute your time directly through practical volunteer roles.",
    background: "/home/keluarga-volunteers-hero.jpeg",
  },
] as const;

const ctas = [
  {
    key: "specialist",
    label: "Volunteer as a Specialist",
    href: "/volunteer/specialist",
  },
  {
    key: "donate",
    label: "Donate",
    href: "https://www.mendaki.org.sg/",
  },
  {
    key: "volunteer",
    label: "Volunteer",
    href: "#opportunity-cards",
  },
] as const;

export function ContributorHero() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = states[activeIndex];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % states.length);
    }, 6500);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      className={styles.hero}
      aria-labelledby="contributor-hero-title"
      style={{ "--hero-image": `url("${active.background}")` } as CSSProperties}
    >
      <div className={styles.heroInner}>
        <Link className={styles.backLink} href="/">
          <span aria-hidden="true">←</span>
          <span>Back to volunteering roles</span>
        </Link>

        <div className={styles.heroContent}>
          <div className={styles.heroCopy}>
            <h1 id="contributor-hero-title">{active.title}</h1>
            <p>{active.description}</p>
          </div>

          <div className={styles.heroActions} aria-label="Ways to contribute">
            {ctas.map((cta) => {
              const highlighted = cta.key === active.key;
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
