import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requirePathwayManager } from "@/lib/auth/pathway-access";
import { getPublishedPathwayMap } from "@/lib/pathways/data";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

import {
  assignVolunteerPosition,
  clearVolunteerPosition,
} from "./actions";

export const metadata: Metadata = { title: "Volunteer pathway positions" };
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

export default async function PathwayPositionsPage({ searchParams }: PageProps) {
  const { supabase } = await requirePathwayManager("/admin/pathways/positions");
  const pathwayMap = await getPublishedPathwayMap(supabase);
  const parameters = await searchParams;
  const q = safeSearch(parameter(parameters, "q") ?? "");
  const error = parameter(parameters, "error");
  const success = parameter(parameters, "success");
  const admin = getPhaseOneAdminClient();

  if (!pathwayMap) {
    throw new Error("A published pathway map is required before assigning positions");
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
    throw new Error("Volunteer pathway-assignment list could not be loaded");
  }

  const volunteers = volunteerResult.data;
  const volunteerIds = volunteers.map(({ id }) => id);
  const positionsResult = volunteerIds.length
    ? await admin
        .schema("pathways")
        .from("volunteer_positions")
        .select(
          "id, volunteer_id, track_stable_key, stage_stable_key, track_name_snapshot, stage_title_snapshot, reason, notes, effective_from",
        )
        .in("volunteer_id", volunteerIds)
        .is("ended_at", null)
        .order("effective_from", { ascending: false })
    : { data: [], error: null };

  if (positionsResult.error) {
    throw new Error("Current pathway positions could not be loaded");
  }

  const positionsByVolunteer = new Map<string, typeof positionsResult.data>();
  for (const position of positionsResult.data ?? []) {
    const rows = positionsByVolunteer.get(position.volunteer_id) ?? [];
    rows.push(position);
    positionsByVolunteer.set(position.volunteer_id, rows);
  }

  const tracks = [...pathwayMap.tracks].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const phases = new Map(
    pathwayMap.phases.map((phase) => [phase.stableKey, phase]),
  );
  const trackByKey = new Map(
    pathwayMap.tracks.map((track) => [track.stableKey, track]),
  );
  const stageOptions = pathwayMap.stages
    .filter(({ isActive }) => isActive)
    .sort((left, right) => {
      const leftTrack = trackByKey.get(left.trackKey)?.sortOrder ?? 99;
      const rightTrack = trackByKey.get(right.trackKey)?.sortOrder ?? 99;
      if (leftTrack !== rightTrack) return leftTrack - rightTrack;
      return (
        (phases.get(left.phaseKey)?.sortOrder ?? 99) -
        (phases.get(right.phaseKey)?.sortOrder ?? 99)
      );
    });

  return (
    <div className="site-shell">
      <PortalHeader status="Pathway positions" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Volunteer development</p>
            <h1>Volunteer pathway positions</h1>
            <p className="muted">
              Confirm a volunteer’s reviewed position on one or more pathway
              tracks. Assignments are staff-managed and audited; attendance or
              registration never advances a volunteer automatically.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/admin/pathways">
              Manage pathway map
            </Link>
            <Link className="button button-secondary" href="/pathways">
              View published map
            </Link>
          </div>
        </div>

        {success === "position_assigned" ? (
          <div className="notice notice-success" role="status">
            Pathway position assigned.
          </div>
        ) : null}
        {success === "position_cleared" ? (
          <div className="notice notice-success" role="status">
            Pathway position cleared while retaining its history.
          </div>
        ) : null}
        {error ? (
          <div className="notice notice-error" role="alert">
            The pathway position action could not be completed. Check the selected
            volunteer, stage and reason.
          </div>
        ) : null}

        <section className="section" aria-labelledby="position-search-title">
          <p className="eyebrow">Find volunteer</p>
          <h2 id="position-search-title">Assign reviewed positions</h2>
          <form method="get" className="phaseone-admin-form">
            <div className="form-field">
              <label htmlFor="position-volunteer-search">
                Name, KELUARGA volunteer ID, or email
              </label>
              <input
                id="position-volunteer-search"
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
                <Link
                  className="button button-secondary"
                  href="/admin/pathways/positions"
                >
                  Clear
                </Link>
              ) : null}
            </div>
          </form>
        </section>

        <section className="record-list" aria-label="Volunteer pathway positions">
          {volunteers.map((volunteer) => {
            const currentPositions = positionsByVolunteer.get(volunteer.id) ?? [];
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
                    {currentPositions.length} active track
                    {currentPositions.length === 1 ? "" : "s"}
                  </span>
                </div>

                {currentPositions.length ? (
                  <div className="record-list">
                    {currentPositions.map((position) => (
                      <article className="record-card" key={position.id}>
                        <div>
                          <p className="record-kicker">
                            {position.track_name_snapshot}
                          </p>
                          <h3>{position.stage_title_snapshot}</h3>
                          <p className="record-meta">{position.reason}</p>
                        </div>
                        <details className="phaseone-disclosure">
                          <summary>Clear position</summary>
                          <form
                            action={clearVolunteerPosition}
                            className="phaseone-admin-form"
                          >
                            <input
                              name="positionId"
                              type="hidden"
                              value={position.id}
                            />
                            <div className="form-field">
                              <label htmlFor={`clear-${position.id}`}>
                                Reason
                              </label>
                              <input
                                id={`clear-${position.id}`}
                                name="reason"
                                minLength={5}
                                maxLength={500}
                                required
                              />
                            </div>
                            <button
                              className="button button-secondary"
                              type="submit"
                            >
                              Clear position
                            </button>
                          </form>
                        </details>
                      </article>
                    ))}
                  </div>
                ) : null}

                <form
                  action={assignVolunteerPosition}
                  className="phaseone-admin-form"
                >
                  <input name="volunteerId" type="hidden" value={volunteer.id} />
                  <div className="form-field">
                    <label htmlFor={`stage-${volunteer.id}`}>
                      Confirm pathway stage
                    </label>
                    <select
                      id={`stage-${volunteer.id}`}
                      name="stageId"
                      defaultValue=""
                      required
                    >
                      <option value="" disabled>Select track and stage</option>
                      {tracks.map((track) => (
                        <optgroup key={track.id} label={track.name}>
                          {stageOptions
                            .filter((stage) => stage.trackKey === track.stableKey)
                            .map((stage) => (
                              <option key={stage.id} value={stage.id}>
                                {phases.get(stage.phaseKey)?.name ?? "Stage"} ·{" "}
                                {stage.title}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor={`position-reason-${volunteer.id}`}>
                      Assignment reason
                    </label>
                    <input
                      id={`position-reason-${volunteer.id}`}
                      name="reason"
                      minLength={5}
                      maxLength={500}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`position-notes-${volunteer.id}`}>
                      Notes (optional)
                    </label>
                    <textarea
                      id={`position-notes-${volunteer.id}`}
                      name="notes"
                      maxLength={1000}
                    />
                  </div>
                  <button className="button button-primary" type="submit">
                    Confirm position
                  </button>
                </form>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
