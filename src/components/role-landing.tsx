import Link from "next/link";

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
  eyebrow,
  title,
  description,
  items,
  ctas,
  actionsAtBottom = false,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  items: readonly RoleItem[];
  ctas: readonly RoleCta[];
  actionsAtBottom?: boolean;
}>) {
  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className={styles.frame}>
        <Link className={styles.backLink} href="/">
          ← Back to volunteering roles
        </Link>

        <section className={styles.hero}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.lede}>{description}</p>

          {!actionsAtBottom ? (
            <div className={styles.actions}>
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
          ) : null}
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

        {actionsAtBottom ? (
          <section className={styles.closingAction} aria-label="Register your interest">
            <div>
              <p className={styles.closingEyebrow}>Ready to volunteer?</p>
              <h2>Take the next step.</h2>
            </div>
            <div className={styles.actions}>
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
          </section>
        ) : null}
      </main>
    </div>
  );
}
