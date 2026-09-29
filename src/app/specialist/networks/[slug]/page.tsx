import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { getLandingPageImage } from "@/lib/content/landing-page-media";
import {
  getProfessionalNetwork,
  professionalNetworks,
  type ProfessionalNetworkTeamMember,
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
    description: network.description,
  };
}

function MemberCard({
  member,
  leadership = false,
}: {
  member: ProfessionalNetworkTeamMember;
  leadership?: boolean;
}) {
  const initials = member.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <article className={leadership ? `${styles.teamCard} ${styles.leadershipCard}` : styles.teamCard}>
      {member.photoUrl ? (
        <img className={styles.profilePhoto} src={member.photoUrl} alt="" />
      ) : (
        <div className={styles.avatar} aria-hidden="true">
          {initials}
        </div>
      )}

      <div className={styles.memberCopy}>
        <span className={leadership ? styles.leadershipBadge : styles.memberBadge}>
          {member.group === "PN Lead" || member.group === "Assistant Lead"
            ? member.group
            : "Core Team Member"}
        </span>
        <h3>{member.name}</h3>
        {member.designation ? <p>{member.designation}</p> : null}
        {member.organisation ? <p className={styles.organisation}>{member.organisation}</p> : null}
        {member.linkedinUrl ? (
          <a
            className={styles.memberLinkedIn}
            href={member.linkedinUrl}
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default async function ProfessionalNetworkPage({ params }: PageProps) {
  const { slug } = await params;
  const network = getProfessionalNetwork(slug);
  if (!network) notFound();

  const fallbackHero = await getLandingPageImage("specialist");
  const heroImage = network.heroImage ?? fallbackHero;
  const leadership = network.coreTeam.filter(
    (member) => member.group === "PN Lead" || member.group === "Assistant Lead",
  );
  const members = network.coreTeam.filter(
    (member) => member.group !== "PN Lead" && member.group !== "Assistant Lead",
  );

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
            <p>{network.description}</p>
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

            {leadership.length > 0 ? (
              <div className={styles.teamGroup}>
                <h3 className={styles.groupTitle}>Leadership</h3>
                <div className={styles.leadershipGrid}>
                  {leadership.map((member) => (
                    <MemberCard member={member} leadership key={member.id} />
                  ))}
                </div>
              </div>
            ) : null}

            {members.length > 0 ? (
              <div className={styles.teamGroup}>
                <h3 className={styles.groupTitle}>Core Team Members</h3>
                <div className={styles.teamGrid}>
                  {members.map((member) => (
                    <MemberCard member={member} key={member.id} />
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className={styles.connectSection}>
            <div>
              <span className={styles.sectionKicker}>Connect with this network</span>
              <h2>Continue the conversation</h2>
              <p>
                Join the network&apos;s LinkedIn group for discussions, professional connections
                and sector updates.
              </p>
            </div>
            <a
              className={styles.secondaryAction}
              href={network.linkedinUrl}
              target="_blank"
              rel="noreferrer"
            >
              <span>Visit LinkedIn</span>
              <span aria-hidden="true">↗</span>
            </a>
          </section>
        </section>
      </main>
    </div>
  );
}
