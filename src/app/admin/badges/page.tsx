import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireGamificationManager } from "@/lib/auth/gamification-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

import {
  awardBadge,
  createBadgeDefinition,
  revokeBadge,
} from "./actions";

export const metadata: Metadata = { title: "Badge management" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parameter(
  values: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function safeSearch(value: string): string {
  return value.replace(/[%_]/g, "").trim().slice(0, 120);
}

const errorMessages: Record<string, string> = {
  invalid_badge: "Enter a valid badge key, name and description.",
  badge_exists: "A badge with that key already exists.",
  badge_create_failed: "The badge definition could not be created.",
  invalid_award: "Select a badge and provide a recognition reason.",
  badge_already_awarded: "This volunteer already has that active badge.",
  award_failed: "The badge could not be awarded.",
  invalid_revocation: "Enter a reason for removing the badge.",
  revoke_failed: "The badge could not be removed.",
};

const successMessages: Record<string, string> = {
  badge_created: "Badge definition created.",
  badge_awarded: "Badge awarded.",
  badge_revoked: "Badge removed from the active profile while retaining its audit history.",
};

export default async function BadgeAdminPage({ searchParams }: PageProps) {
  await requireGamificationManager("/admin/badges");
  const parameters = await searchParams;
  const q = safeSearch(parameter(parameters, "q") ?? "");
  const error = parameter(parameters, "error");
  const success = parameter(parameters, "success");
  const admin = getPhaseOneAdminClient();

  const definitionsResult = await admin
    .schema("gamification")
    .from("badge_definitions")
    .select("id, stable_key, name, description, created_at")
    .order("name");

  if (definitionsResult.error) {
    throw new Error("Badge definitions could not be loaded");
  }

  let volunteerQuery = admin
    .schema("core")
    .from("volunteers")
    .select("id, volunteer_code, display_name, primary_email_normalized, mobile")
    .order("display_name", { ascending: true, nullsFirst: false })
    .limit(100);

  if (q) {
    if (/^KEL\d{5}$/i.test(q)) {
      volunteerQuery = volunteerQuery.eq("volunteer_code", q.toUpperCase());
    } else if (q.includes("@")) {
      volunteerQuery = volunteerQuery.ilike(
        "primary_email_normalized",
        `%${q.toLowerCase()}%`,
      );
    } else {
      volunteerQuery = volunteerQuery.ilike("display_name", `%${q}%`);
    }
  }

  const volunteerResult = await volunteerQuery;
  if (volunteerResult.error || !volunteerResult.data) {
    throw new Error("Volunteer badge-management list could not be loaded");
  }

  const volunteers = volunteerResult.data;
  const volunteerIds = volunteers.map(({ id }) => id);
  const awardsResult = volunteerIds.length
    ? await admin
        .schema("gamification")
        .from("volunteer_badges")
        .select("id, volunteer_id, badge_id, reason, awarded_at")
        .in("volunteer_id", volunteerIds)
        .is("revoked_at", null)
        .order("awarded_at", { ascending: false })
    : { data: [], error: null };

  if (awardsResult.error) {
    throw new Error("Active badge awards could not be loaded");
  }

  const definitions = definitionsResult.data ?? [];
  const definitionById = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  const awardsByVolunteer = new Map<string, typeof awardsResult.data>();

  for (const award of awardsResult.data ?? []) {
    const rows = awardsByVolunteer.get(award.volunteer_id) ?? [];
    rows.push(award);
    awardsByVolunteer.set(award.volunteer_id, rows);
  }

  return (
    <div className="site-shell">
      <PortalHeader status="Badge management" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">KELUARGA recognition</p>
            <h1>Badge management</h1>
            <p className="muted">
              First Step and 15/30/60-hour badges follow MakLom-approved
              contributions automatically. Other recognition badges are awarded
              through explicit staff review.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/admin/points">
              Points management
            </Link>
            <Link className="button button-secondary" href="/dashboard">
              Back to My Profile
            </Link>
          </div>
        </div>

        {success && successMessages[success] ? (
          <div className="notice notice-success" role="status">
            {successMessages[success]}
          </div>
        ) : null}
        {error ? (
          <div className="notice notice-error" role="alert">
            {errorMessages[error] ?? "The badge action could not be completed."}
          </div>
        ) : null}

        <section className="section" aria-labelledby="badge-definition-title">
          <p className="eyebrow">Badge catalogue</p>
          <h2 id="badge-definition-title">Create a badge</h2>
          <form action={createBadgeDefinition} className="phaseone-admin-form">
            <div className="form-field">
              <label htmlFor="badge-key">Stable key</label>
              <input
                id="badge-key"
                name="stableKey"
                placeholder="community-champion"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="badge-name">Badge name</label>
              <input id="badge-name" name="name" maxLength={120} required />
            </div>
            <div className="form-field">
              <label htmlFor="badge-description">Description</label>
              <textarea
                id="badge-description"
                name="description"
                minLength={10}
                maxLength={500}
                required
              />
            </div>
            <div className="actions">
              <button className="button button-primary" type="submit">
                Create badge
              </button>
            </div>
          </form>

          {definitions.length ? (
            <div className="record-list">
              {definitions.map((definition) => (
                <article className="record-card" key={definition.id}>
                  <div>
                    <p className="record-kicker">{definition.stable_key}</p>
                    <h3>{definition.name}</h3>
                    <p className="record-meta">{definition.description}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No badge definitions have been created yet.</p>
          )}
        </section>

        <section className="section" aria-labelledby="badge-volunteer-search-title">
          <p className="eyebrow">Find volunteer</p>
          <h2 id="badge-volunteer-search-title">Award badges</h2>
          <form method="get" className="phaseone-admin-form">
            <div className="form-field">
              <label htmlFor="badge-volunteer-search">
                Name, KELUARGA volunteer ID, or email
              </label>
              <input
                id="badge-volunteer-search"
                maxLength={120}
                name="q"
                defaultValue={q}
              />
            </div>
            <div className="actions">
              <button className="button button-primary" type="submit">
                Search
              </button>
              {q ? (
                <Link className="button button-secondary" href="/admin/badges">
                  Clear
                </Link>
              ) : null}
            </div>
          </form>
        </section>

        <section className="record-list" aria-label="Volunteer badges">
          {volunteers.map((volunteer) => {
            const activeAwards = awardsByVolunteer.get(volunteer.id) ?? [];
            return (
              <article className="panel" key={volunteer.id}>
                <div className="section-header">
                  <div>
                    <p className="eyebrow">{volunteer.volunteer_code}</p>
                    <h2>{volunteer.display_name ?? "Volunteer"}</h2>
                    <p className="muted">
                      {volunteer.primary_email_normalized ?? "No email"}
                      {volunteer.mobile ? ` · ${volunteer.mobile}` : ""}
                    </p>
                  </div>
                  <span className="status-pill">
                    {activeAwards.length} active badge{activeAwards.length === 1 ? "" : "s"}
                  </span>
                </div>

                {activeAwards.length ? (
                  <div className="record-list">
                    {activeAwards.map((award) => {
                      const definition = definitionById.get(award.badge_id);
                      return (
                        <article className="record-card" key={award.id}>
                          <div>
                            <p className="record-kicker">Active badge</p>
                            <h3>{definition?.name ?? "Badge"}</h3>
                            <p className="record-meta">{award.reason}</p>
                          </div>
                          <details className="phaseone-disclosure">
                            <summary>Remove</summary>
                            <form action={revokeBadge} className="phaseone-admin-form">
                              <input name="awardId" type="hidden" value={award.id} />
                              <div className="form-field">
                                <label htmlFor={`revoke-${award.id}`}>
                                  Correction reason
                                </label>
                                <input
                                  id={`revoke-${award.id}`}
                                  name="reason"
                                  minLength={5}
                                  maxLength={500}
                                  required
                                />
                              </div>
                              <button className="button button-secondary" type="submit">
                                Remove active badge
                              </button>
                            </form>
                          </details>
                        </article>
                      );
                    })}
                  </div>
                ) : null}

                {definitions.length ? (
                  <form action={awardBadge} className="phaseone-admin-form">
                    <input name="volunteerId" type="hidden" value={volunteer.id} />
                    <input name="requestId" type="hidden" value={randomUUID()} />
                    <div className="form-field">
                      <label htmlFor={`badge-${volunteer.id}`}>Badge</label>
                      <select
                        id={`badge-${volunteer.id}`}
                        name="badgeId"
                        required
                        defaultValue=""
                      >
                        <option value="" disabled>Select badge</option>
                        {definitions.map((definition) => (
                          <option key={definition.id} value={definition.id}>
                            {definition.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <label htmlFor={`badge-reason-${volunteer.id}`}>
                        Recognition reason
                      </label>
                      <input
                        id={`badge-reason-${volunteer.id}`}
                        name="reason"
                        minLength={5}
                        maxLength={500}
                        required
                      />
                    </div>
                    <button className="button button-primary" type="submit">
                      Award badge
                    </button>
                  </form>
                ) : (
                  <p className="muted">Create a badge definition before awarding one.</p>
                )}
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
