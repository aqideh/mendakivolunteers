"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

import styles from "./contributor-hero.module.css";

const states = [
  {
    key: "volunteer",
    title: "Serve with a Hearth, One Keluarga.",
    description:
      "Join upcoming community activities and events that match your interests and availability. Contribute your time through practical volunteer roles that support programme delivery.",
    background: "/home/keluarga-volunteers-hero.jpeg",
  },
  {
    key: "contribute",
    title: "Transform Ideas into Community Impact",
    description:
      "Have an Idea that can benefit MENDAKI volunteers? Individuals, community groups, and organisations are welcome to propose projects that enhance volunteers' skills, well-being, recognition, or overall volunteering experience.",
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
    href: "#opportunity-cards",
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
  const active = states[activeIndex] ?? states[0];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

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
