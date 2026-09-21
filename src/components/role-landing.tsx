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
  title,
  description,
  items,
  ctas,
}: Readonly<{
  title: string;
  description: string;
  items: readonly RoleItem[];
  ctas: readonly RoleCta[];
}>) {
  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className={styles.frame}>
        <section className={styles.hero} aria-labelledby="role-title">
          <div className={styles.heroInner}>
            <Link className={styles.backLink} href="/">
              <span aria-hidden="true">←</span>
              <span>Back to volunteering roles</span>
            </Link>

            <div className={styles.heroCopy}>
              <h1 id="role-title">{title}</h1>
              <p className={styles.lede}>{description}</p>
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
