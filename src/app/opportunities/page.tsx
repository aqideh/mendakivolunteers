import type { Metadata } from "next";

import { ContributorHero } from "@/app/opportunities/contributor-hero";
import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDate } from "@/lib/content/dates";
import { getUpcomingPhaseOneOpportunities } from "@/lib/phaseone/opportunities";

export const metadata: Metadata = {
  title: "Volunteer opportunities",
  description:
    "Browse upcoming MENDAKI volunteer opportunities and continue to the official registration portal.",
};

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const opportunities = await getUpcomingPhaseOneOpportunities();

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className="phaseone-frame phaseone-opportunities-frame">
        <ContributorHero />

        {opportunities.length > 0 ? (
          <section
            id="opportunity-cards"
            className="phaseone-opportunity-list phaseone-opportunities-grid"
            aria-label="Upcoming volunteer opportunities"
          >
            {opportunities.map((opportunity) => (
              <article className="phaseone-opportunity-card" key={opportunity.id}>
                <div className="phaseone-opportunity-image" aria-hidden="true">
                  {opportunity.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={opportunity.image_url} alt="" loading="lazy" />
                  ) : (
                    <span>MENDAKI</span>
                  )}
                </div>
                <div className="phaseone-opportunity-body">
                  <p className="phaseone-opportunity-date">
                    {formatSingaporeDate(opportunity.starts_at)}
                  </p>
                  <h2>{opportunity.title}</h2>
                  {opportunity.summary ? (
                    <p className="phaseone-opportunity-summary">
                      {opportunity.summary}
                    </p>
                  ) : null}
                  <dl className="phaseone-opportunity-details">
                    <div>
                      <dt>Venue</dt>
                      <dd>
                        {opportunity.venue ??
                          "See the registration portal for details"}
                      </dd>
                    </div>
                    {opportunity.schedule_text ? (
                      <div>
                        <dt>Schedule</dt>
                        <dd>{opportunity.schedule_text}</dd>
                      </div>
                    ) : null}
                    {opportunity.ends_at ? (
                      <div>
                        <dt>Ends</dt>
                        <dd>{formatSingaporeDate(opportunity.ends_at)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <a
                    className="button button-primary phaseone-opportunity-cta"
                    href="https://www.mendaki.org.sg/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View and sign up
                    <span aria-hidden="true"> ↗</span>
                  </a>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section id="opportunity-cards" className="panel empty-state phaseone-empty-state">
            <h2>No upcoming opportunities right now.</h2>
            <p className="muted">
              New MENDAKI opportunities will appear here after they are published
              through the official registration process.
            </p>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <span>Opportunity registration is managed through the official registration
        portal. Browsing Keluarga MENDAKI does not require an account.</span>
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
