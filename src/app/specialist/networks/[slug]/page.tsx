import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { getLandingPageImage } from "@/lib/content/landing-page-media";
import {
  getProfessionalNetwork,
  professionalNetworks,
} from "@/lib/content/professional-networks";

import styles from "./network.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return professionalNetworks.map((network) => ({ slug: network.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const network = getProfessionalNetwork(slug);
  if (!network) return { title: "Professional Network" };

  return {
    title: `${network.name} | MENDAKI Professional Networks`,
    description:
      network.description ??
      `Connect with the MENDAKI Professional Network for ${network.name}.`,
  };
}

export default async function ProfessionalNetworkPage({ params }: PageProps) {
  const { slug } = await params;
  const network = getProfessionalNetwork(slug);
  if (!network) notFound();

  const fallbackHero = await getLandingPageImage("specialist");
  const heroImage = network.heroImage ?? fallbackHero;
  const description =
    network.description ??
    `Part of the MENDAKI Professional Networks, ${network.name} connects Malay/Muslim professionals to build meaningful industry relationships, share knowledge, grow professionally and contribute back to the community.`;

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Specialist" lite />

      <main className={styles.page}>
        <section className={styles.hero}>
          <div
            className={styles.heroMedia}
            aria-hidden="true"
            style={{ backgroundImage: `url("${heroImage}")` }}
          />
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroInner}>
            <Link className={styles.backLink} href="/specialist">
              <span aria-hidden="true">←</span>
              <span>Back to Professional Networks</span>
            </Link>

            <div className={styles.heroCopy}>
              <span className={styles.eyebrow}>MENDAKI Professional Networks</span>
              <h1>{network.name}</h1>
            </div>
          </div>
        </section>

        <section className={styles.content}>
          <div className={styles.intro}>
            <div>
              <span className={styles.sectionKicker}>About the network</span>
              <h2>Build connections. Grow together.</h2>
            </div>
            <p>{description}</p>
          </div>

          <div className={styles.actions}>
            <a
              className={styles.primaryAction}
              href={network.linkedinUrl}
              target="_blank"
              rel="noreferrer"
            >
              <span>Join on LinkedIn</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>

          <section className={styles.teamSection} aria-labelledby="core-team-title">
            <div className={styles.sectionHeading}>
              <span className={styles.sectionKicker}>People behind the network</span>
              <h2 id="core-team-title">Core Team</h2>
            </div>

            {network.coreTeam.length > 0 ? (
              <div className={styles.teamGrid}>
                {network.coreTeam.map((member) => (
                  <article className={styles.teamCard} key={`${member.name}-${member.role ?? ""}`}>
                    <div className={styles.avatar} aria-hidden="true">
                      {member.name
                        .split(" ")
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")}
                    </div>
                    <div>
                      <h3>{member.name}</h3>
                      {member.role ? <p>{member.role}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.teamPending}>
                Core Team details are being migrated from the Professional Networks directory.
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}
