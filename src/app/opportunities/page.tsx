import type { Metadata } from "next";

import { ContributorHero } from "@/app/opportunities/contributor-hero";
import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDate } from "@/lib/content/dates";
import { getUpcomingPhaseOneOpportunities } from "@/lib/phaseone/opportunities";
import { loadOpportunitySocialProof } from "@/lib/phaseone/opportunity-social-proof";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Volunteer opportunities",
  description:
    "Browse upcoming MENDAKI volunteer opportunities. KELUARGA manages volunteer opportunities and the registration journey.",
};

export const dynamic = "force-dynamic";

function formatSingaporeTime(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function OpportunitiesPage() {
  const opportunities = await getUpcomingPhaseOneOpportunities();
  const supabase = await createClient();
  const userResult = await supabase.auth.getUser();
  const isSignedIn = Boolean(userResult.data.user);
  const socialProof = await loadOpportunitySocialProof(
    opportunities.map((opportunity) => opportunity.id),
    isSignedIn,
  );

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className="phaseone-frame phaseone-opportunities-frame">
        <ContributorHero />

        {opportunities.length > 0 ? (
          <section
            id="opportunity-cards"
            className="phaseone-opportunity-list phaseone-opportunities-grid phaseone-opportunities-peek"
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
                  <div className="phaseone-opportunity-pills" aria-label="Opportunity schedule">
                    <span>{formatSingaporeDate(opportunity.starts_at)}</span>
                    <span>{formatSingaporeTime(opportunity.starts_at)}</span>
                    {opportunity.timeslots.length > 1 ? (
                      <span>{opportunity.timeslots.length} shifts</span>
                    ) : null}
                  </div>

                  <div className="phaseone-opportunity-heading">
                    <h2>{opportunity.title}</h2>
                    {opportunity.category ? (
                      <span className="phaseone-opportunity-category">
                        {opportunity.category}
                      </span>
                    ) : null}
                  </div>

                  <p className="phaseone-opportunity-venue">
                    {opportunity.venue ?? "Venue details to be confirmed"}
                  </p>

                  {opportunity.summary ? (
                    <p className="phaseone-opportunity-summary">
                      {opportunity.summary}
                    </p>
                  ) : null}

                  <div className="phaseone-opportunity-card-footer">
                    {(() => {
                      const proof = socialProof.get(opportunity.id) ?? {
                        confirmedCount: 0,
                        avatarUrls: [],
                      };
                      return proof.confirmedCount > 0 ? (
                        <div
                          className="phaseone-opportunity-social-proof"
                          aria-label={`${proof.confirmedCount} confirmed volunteers`}
                        >
                          {isSignedIn && proof.avatarUrls.length > 0 ? (
                            <div className="phaseone-opportunity-avatar-stack" aria-hidden="true">
                              {proof.avatarUrls.map((url, index) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={url} alt="" key={`${url}-${index}`} />
                              ))}
                            </div>
                          ) : null}
                          <span>
                            {proof.confirmedCount === 1
                              ? "1 volunteer registered"
                              : `${proof.confirmedCount} volunteers registered`}
                          </span>
                        </div>
                      ) : (
                        <span className="phaseone-opportunity-social-empty">
                          Be among the first to volunteer
                        </span>
                      );
                    })()}

                    <a
                      className="button button-primary phaseone-opportunity-cta"
                      href={`/opportunities/${opportunity.slug}`}
                    >
                      Volunteer
                      <span aria-hidden="true">→</span>
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section id="opportunity-cards" className="panel empty-state phaseone-empty-state">
            <h2>No upcoming opportunities right now.</h2>
            <p className="muted">
              New MENDAKI opportunities will appear here after they are published.
            </p>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <span>Keluarga MENDAKI manages volunteer opportunity discovery, registration and event participation.</span>
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
