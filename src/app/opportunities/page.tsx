import type { Metadata } from "next";

import { ContributorHero } from "@/app/opportunities/contributor-hero";
import { OpportunityFilter } from "@/app/opportunities/opportunity-filter";
import { PortalHeader } from "@/components/portal-header";
import { getLandingPageImage } from "@/lib/content/landing-page-media";
import { getUpcomingPhaseOneOpportunities } from "@/lib/phaseone/opportunities";
import { loadOpportunitySocialProof } from "@/lib/phaseone/opportunity-social-proof";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Volunteer opportunities",
  description:
    "Browse upcoming MENDAKI volunteer opportunities. KELUARGA manages volunteer opportunities and the registration journey.",
};

export const dynamic = "force-dynamic";

function singaporeDateParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(value));

  return {
    day: parts.find((part) => part.type === "day")?.value ?? "",
    month: parts.find((part) => part.type === "month")?.value ?? "",
    year: parts.find((part) => part.type === "year")?.value ?? "",
  };
}

function singaporeDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function formatOpportunityDateRange(startsAt: string, endsAt: string | null) {
  const start = singaporeDateParts(startsAt);
  const end = singaporeDateParts(endsAt ?? startsAt);

  if (
    start.year === end.year &&
    start.month === end.month &&
    start.day === end.day
  ) {
    return `${start.day} ${start.month} ${start.year}`;
  }

  if (start.year === end.year && start.month === end.month) {
    return `${start.day} – ${end.day} ${start.month} ${start.year}`;
  }

  if (start.year === end.year) {
    return `${start.day} ${start.month} – ${end.day} ${end.month} ${start.year}`;
  }

  return `${start.day} ${start.month} ${start.year} – ${end.day} ${end.month} ${end.year}`;
}

export default async function OpportunitiesPage() {
  const [opportunities, contributorHeroImage] = await Promise.all([
    getUpcomingPhaseOneOpportunities(),
    getLandingPageImage("contributor"),
  ]);
  const supabase = await createClient();
  const userResult = await supabase.auth.getUser();
  const isSignedIn = Boolean(userResult.data.user);
  const socialProof = await loadOpportunitySocialProof(
    opportunities.map((opportunity) => opportunity.id),
    isSignedIn,
  );
  const categories = Array.from(
    new Set(
      opportunities
        .map((opportunity) => opportunity.category?.trim())
        .filter((category): category is string => Boolean(category)),
    ),
  ).sort((a, b) => a.localeCompare(b, "en-SG"));

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Community volunteers" lite />
      <main className="phaseone-frame phaseone-opportunities-frame">
        <ContributorHero heroImage={contributorHeroImage} />

        {opportunities.length > 0 ? (
          <section
            id="opportunity-cards"
            className="phaseone-opportunity-list phaseone-opportunities-grid phaseone-opportunities-peek"
            aria-label="Upcoming volunteer opportunities"
          >
            {opportunities.map((opportunity) => (
              <article
                className="phaseone-opportunity-card"
                key={opportunity.id}
                data-opportunity-filter-card
                data-search={[
                  opportunity.title,
                  opportunity.venue,
                  opportunity.summary,
                  opportunity.category,
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-category={opportunity.category?.trim() ?? ""}
                data-starts-at={singaporeDateKey(opportunity.starts_at)}
                data-ends-at={singaporeDateKey(opportunity.ends_at ?? opportunity.starts_at)}
              >
                <div className="phaseone-opportunity-image" aria-hidden="true">
                  {opportunity.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={opportunity.image_url} alt="" loading="lazy" />
                  ) : (
                    <span>MENDAKI</span>
                  )}
                </div>
                <div className="phaseone-opportunity-body">
                  <div className="phaseone-opportunity-pills" aria-label="Opportunity details">
                    {opportunity.category ? (
                      <span className="phaseone-opportunity-category">
                        {opportunity.category}
                      </span>
                    ) : null}
                    <span>
                      {formatOpportunityDateRange(
                        opportunity.starts_at,
                        opportunity.ends_at,
                      )}
                    </span>
                    <span>
                      {opportunity.timeslots.length}{" "}
                      {opportunity.timeslots.length === 1 ? "shift" : "shifts"}
                    </span>
                  </div>

                  <div className="phaseone-opportunity-heading">
                    <h2>{opportunity.title}</h2>
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

        {opportunities.length > 0 ? (
          <>
            <section
              id="opportunity-filter-empty"
              className="panel empty-state phaseone-empty-state phaseone-opportunity-filter-empty"
              hidden
              aria-live="polite"
            >
              <h2>No matching opportunities.</h2>
              <p className="muted">Try changing or clearing your filters.</p>
            </section>
            <OpportunityFilter categories={categories} />
          </>
        ) : null}
      </main>
      <footer className="site-footer">
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
