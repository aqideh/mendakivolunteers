import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { FAQ_SECTIONS } from "@/lib/content/faq";

import styles from "./faq.module.css";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "Help and information for KELUARGA MENDAKI volunteers.",
};

export default function FaqPage() {
  const hasFaqContent = FAQ_SECTIONS.some((section) => section.items.length > 0);

  return (
    <div className="site-shell">
      <PortalHeader status="Frequently asked questions" />
      <main className="page-frame narrow-frame">
        <section className={styles.hero}>
          <p className="eyebrow">Help and support</p>
          <h1>How can we help?</h1>
          <p className="lede">
            Quick answers about volunteering, attendance records, VolunteerSG
            and testimonials.
          </p>
        </section>

        {hasFaqContent ? (
          <>
            <div className={styles.sections}>
              {FAQ_SECTIONS.map((section) =>
                section.items.length > 0 ? (
                  <section className={styles.section} key={section.title}>
                    <div className={styles.sectionHeading}>
                      <p>{section.eyebrow}</p>
                      <h2>{section.title}</h2>
                    </div>
                    <div className={styles.questions}>
                      {section.items.map((item) => (
                        <details className={styles.item} key={item.question}>
                          <summary>{item.question}</summary>
                          <p>{item.answer}</p>
                        </details>
                      ))}
                    </div>
                  </section>
                ) : null,
              )}
            </div>

            <section className={styles.supportCard} aria-labelledby="faq-support">
              <div>
                <p className={styles.supportEyebrow}>Still need help?</p>
                <h2 id="faq-support">We’re here to help.</h2>
                <p>
                  For any volunteering queries, account issues or other support,
                  reach out to the MENDAKI Volunteer Management team.
                </p>
              </div>
              <a
                className={styles.supportLink}
                href="mailto:volunteer@mendaki.org.sg"
              >
                volunteer@mendaki.org.sg
                <span aria-hidden="true">→</span>
              </a>
            </section>
          </>
        ) : (
          <section className="panel empty-state" aria-labelledby="faq-coming-soon">
            <h2 id="faq-coming-soon">FAQ content is being prepared.</h2>
            <p className="muted">
              Volunteer Management will add the approved questions and answers
              here. You can still browse current volunteering opportunities.
            </p>
            <Link className="button button-secondary" href="/opportunities">
              View opportunities
            </Link>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <span>Keluarga MENDAKI — Volunteer App</span>
        <span className="site-footer-copyright">
          © 2026{" "}
          <a href="https://www.mendaki.org.sg/" target="_blank" rel="noreferrer">
            Yayasan MENDAKI
          </a>
        </span>
      </footer>
    </div>
  );
}
