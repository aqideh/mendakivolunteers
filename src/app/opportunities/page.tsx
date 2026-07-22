import type { Metadata } from "next";

import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getUpcomingPhaseOneOpportunities } from "@/lib/phaseone/opportunities";

export const metadata: Metadata = {
  title: "Volunteer opportunities",
  description: "Browse upcoming MENDAKI volunteer opportunities and register through Volunteer.gov.sg.",
};

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const opportunities = await getUpcomingPhaseOneOpportunities();

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" />
      <main className="phaseone-frame">
        <section className="phaseone-intro">
          <p className="eyebrow">MENDAKI volunteer opportunities</p>
          <h1>Volunteer with the community.</h1>
          <p className="lede">
            Browse upcoming opportunities below. Registration and confirmation are
            completed securely on Volunteer.gov.sg.
          </p>
        </section>

        {opportunities.length > 0 ? (
          <section className="phaseone-opportunity-list" aria-label="Upcoming volunteer opportunities">
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
                    {formatSingaporeDateTime(opportunity.starts_at)}
                  </p>
                  <h2>{opportunity.title}</h2>
                  {opportunity.summary ? (
                    <p className="phaseone-opportunity-summary">{opportunity.summary}</p>
                  ) : null}
                  <dl className="phaseone-opportunity-details">
                    <div>
                      <dt>Venue</dt>
                      <dd>{opportunity.venue ?? "See Volunteer.gov.sg for details"}</dd>
                    </div>
                    {opportunity.ends_at ? (
                      <div>
                        <dt>Ends</dt>
                        <dd>{formatSingaporeDateTime(opportunity.ends_at)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <a
                    className="button button-primary phaseone-opportunity-cta"
                    href={opportunity.source_url}
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
          <section className="panel empty-state phaseone-empty-state">
            <h2>No upcoming opportunities right now.</h2>
            <p className="muted">
              New MENDAKI opportunities will appear here after they are published on
              Volunteer.gov.sg.
            </p>
          </section>
        )}
      </main>
      <footer className="site-footer">
        Opportunity registration is managed on Volunteer.gov.sg.
      </footer>
    </div>
  );
}
