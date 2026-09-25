import Link from "next/link";
import type { CSSProperties } from "react";

import { PortalHeader } from "@/components/portal-header";

import styles from "@/app/volunteer/role-landing.module.css";

type RoleItem = Readonly<{
  title: string;
  description: string;
}>;

type RoleCta = Readonly<{
  href: string;
  label: string;
  secondary?: boolean;
}>;

export function RoleLanding({
  title,
  description,
  inlineCta,
  heroImage,
  heroPosition,
  items,
  ctas,
}: Readonly<{
  title: string;
  description: string;
  inlineCta?: RoleCta;
  heroImage?: string;
  heroPosition?: string;
  items: readonly RoleItem[];
  ctas: readonly RoleCta[];
}>) {
  const heroStyle = heroImage
    ? ({
        "--role-hero-image": `url("${heroImage}")`,
        ...(heroPosition ? { "--role-hero-position": heroPosition } : {}),
      } as CSSProperties)
    : undefined;

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className={styles.frame}>
        <section className={styles.hero} aria-labelledby="role-title" style={heroStyle}>
          <div className={styles.heroInner}>
            <Link className={styles.backLink} href="/">
              <span aria-hidden="true">←</span>
              <span>Back to volunteering roles</span>
            </Link>

            <div className={styles.heroContent}>
              <div className={styles.heroCopy}>
                <h1 id="role-title">{title}</h1>
                <p className={styles.lede}>{description}</p>
                {inlineCta ? (
                  <Link className={styles.inlineAction} href={inlineCta.href}>
                    <span>{inlineCta.label}</span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                ) : null}
              </div>

              <div className={styles.heroActions}>
                {ctas.map(({ href, label, secondary }) => (
                  <Link
                    className={secondary ? styles.secondaryAction : styles.primaryAction}
                    href={href}
                    key={href}
                  >
                    <span>{label}</span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.roles} aria-label={title + " opportunities"}>
          {items.map(({ title: itemTitle, description: itemDescription }, index) => (
            <article className={styles.roleItem} key={itemTitle}>
              <span className={styles.roleNumber}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2>{itemTitle}</h2>
                <p>{itemDescription}</p>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
