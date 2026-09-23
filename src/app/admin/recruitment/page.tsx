import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireVolunteerManager } from "@/lib/auth/volunteer-management-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { reviewRecruitmentApplication } from "./actions";

export const metadata: Metadata = { title: "Volunteer recruitment" };
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

function label(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function RecruitmentAdminPage({ searchParams }: PageProps) {
  await requireVolunteerManager("/admin/recruitment");
  const params = await searchParams;
  const error = parameter(params, "error");
  const success = parameter(params, "success");
  const admin = getPhaseOneAdminClient();

  const applicationsResult = await admin
    .from("keluarga_recruitment_applications")
    .select(
      "id, volunteer_id, status, interest_area, motivation, skills_experience, availability_notes, referral_source, submitted_at, reviewed_at, review_note",
    )
    .order("submitted_at", { ascending: true })
    .limit(2000);

  if (applicationsResult.error || !applicationsResult.data) {
    throw new Error("Volunteer recruitment applications could not be loaded");
  }

  const applications = applicationsResult.data;
  const volunteerIds = Array.from(
    new Set(applications.map(({ volunteer_id }) => String(volunteer_id))),
  );
  const volunteersResult = volunteerIds.length
    ? await admin
        .schema("core")
        .from("volunteers")
        .select(
          "id, volunteer_code, display_name, primary_email_normalized, mobile, age",
        )
        .in("id", volunteerIds)
    : { data: [], error: null };

  if (volunteersResult.error) {
    throw new Error("Volunteer recruitment profiles could not be loaded");
  }

  const volunteerById = new Map(
    (volunteersResult.data ?? []).map((volunteer) => [volunteer.id, volunteer]),
  );
  const sorted = [...applications].sort((left, right) => {
    const rank = (status: string) =>
      status === "submitted" ? 0 : status === "reviewing" ? 1 : 2;
    return (
      rank(String(left.status)) - rank(String(right.status)) ||
      String(left.submitted_at).localeCompare(String(right.submitted_at))
    );
  });

  return (
    <div className="site-shell">
      <PortalHeader status="Volunteer recruitment" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Recruitment intake</p>
            <h1>Prospective volunteers</h1>
            <p className="muted">
              Review volunteering interests before recommending programmes. Recruitment
              status is separate from individual programme registrations.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/admin/registrations">
              Programme registrations
            </Link>
            <Link className="button button-secondary" href="/admin/events">
              Event Operations
            </Link>
          </div>
        </div>

        {success ? (
          <div className="notice notice-success" role="status">
            Recruitment application updated.
          </div>
        ) : null}
        {error ? (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        ) : null}

        <section className="record-list" aria-label="Recruitment applications">
          {sorted.map((application) => {
            const volunteer = volunteerById.get(application.volunteer_id);
            const canReview = ["submitted", "reviewing"].includes(
              String(application.status),
            );

            return (
              <article className="panel" key={application.id}>
                <div className="section-header">
                  <div>
                    <p className="eyebrow">
                      {volunteer?.volunteer_code ?? "KEL volunteer"}
                    </p>
                    <h2>{volunteer?.display_name ?? "Volunteer"}</h2>
                    <p className="muted">
                      {volunteer?.primary_email_normalized ?? "No email"} ·{" "}
                      {volunteer?.mobile ?? "No mobile"}
                      {volunteer?.age == null ? "" : ` · Age ${volunteer.age}`}
                    </p>
                  </div>
                  <span
                    className="status-pill"
                    data-state={String(application.status)}
                  >
                    {label(String(application.status))}
                  </span>
                </div>

                <dl className="data-list">
                  <div className="data-row">
                    <dt>Interest</dt>
                    <dd>{label(String(application.interest_area))}</dd>
                  </div>
                  <div className="data-row">
                    <dt>Submitted</dt>
                    <dd>{formatSingaporeDateTime(String(application.submitted_at))}</dd>
                  </div>
                  <div className="data-row">
                    <dt>Motivation</dt>
                    <dd>{application.motivation}</dd>
                  </div>
                  <div className="data-row">
                    <dt>Skills / experience</dt>
                    <dd>{application.skills_experience ?? "Not provided"}</dd>
                  </div>
                  <div className="data-row">
                    <dt>Availability</dt>
                    <dd>{application.availability_notes ?? "Not provided"}</dd>
                  </div>
                  <div className="data-row">
                    <dt>Source</dt>
                    <dd>{application.referral_source ?? "Not provided"}</dd>
                  </div>
                  {application.review_note ? (
                    <div className="data-row">
                      <dt>Review note</dt>
                      <dd>{application.review_note}</dd>
                    </div>
                  ) : null}
                </dl>

                {canReview ? (
                  <form
                    action={reviewRecruitmentApplication}
                    className="phaseone-admin-form"
                  >
                    <input
                      name="applicationId"
                      type="hidden"
                      value={application.id}
                    />
                    <div className="form-field">
                      <label htmlFor={`recruitment-note-${application.id}`}>
                        Staff note (optional)
                      </label>
                      <textarea
                        id={`recruitment-note-${application.id}`}
                        maxLength={1500}
                        name="note"
                        rows={3}
                      />
                    </div>
                    <div className="actions">
                      <button
                        className="button button-secondary"
                        name="decision"
                        type="submit"
                        value="reviewing"
                      >
                        Mark under review
                      </button>
                      <button
                        className="button button-primary"
                        name="decision"
                        type="submit"
                        value="accepted"
                      >
                        Accept
                      </button>
                      <button
                        className="button"
                        name="decision"
                        type="submit"
                        value="not_selected"
                      >
                        Close / not selected
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            );
          })}

          {sorted.length === 0 ? (
            <div className="panel empty-state">
              No recruitment applications have been submitted yet.
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
