import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  approveTemporaryVolunteer,
  deferExistingVolunteerMatch,
  rejectAndRequestProfileRefill,
} from "@/app/admin/reconciliation/actions";
import { requireActiveAccount } from "@/lib/auth/account-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = { title: "Volunteer reconciliation" };
export const dynamic = "force-dynamic";

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const sectionOptions = [
  ["contact", "Contact details"],
  ["home", "Home area"],
  ["personal", "Personal details"],
  ["interests", "Volunteering interests"],
  ["skills", "Skills"],
  ["availability", "Availability"],
  ["event-readiness", "Event readiness"],
  ["education", "Education"],
  ["photo", "Profile photo"],
  ["about", "About"],
] as const;

async function requireReviewAccess() {
  const { supabase, userId } = await requireActiveAccount(
    "/admin/reconciliation",
  );
  const rolesResult = await supabase
    .schema("core")
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (
    rolesResult.error ||
    !(rolesResult.data ?? []).some(
      ({ role }) => role === "admin" || role === "volteam",
    )
  ) {
    redirect("/dashboard?error=event_access_denied");
  }
}

function one(
  values: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReconciliationPage({ searchParams }: PageProps) {
  await requireReviewAccess();
  const params = await searchParams;
  const success = one(params, "success");
  const error = one(params, "error");
  const admin = getPhaseOneAdminClient();

  const casesResult = await admin
    .schema("core")
    .from("account_link_cases")
    .select(
      "id, auth_user_id, status, reason_code, review_outcome, candidate_volunteer_id, requested_sections, volunteer_message, submitted_for_review_at, resubmitted_at, created_at",
    )
    .in("status", ["pending", "needs_review"])
    .not("submitted_for_review_at", "is", null)
    .order("submitted_for_review_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (casesResult.error) {
    throw new Error("Volunteer reconciliation queue could not be loaded");
  }

  const cases = casesResult.data ?? [];
  const userIds = cases.map((item) => item.auth_user_id);

  const [accountsResult, provisionalResult] = await Promise.all([
    userIds.length
      ? admin
          .schema("core")
          .from("user_accounts")
          .select(
            "id, display_name, claimed_email_normalized, email_ownership_verified, created_at",
          )
          .in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? admin
          .schema("core")
          .from("volunteers")
          .select(
            "id, auth_user_id, volunteer_code, display_name, mobile, primary_email_normalized",
          )
          .in("auth_user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (accountsResult.error || provisionalResult.error) {
    throw new Error("Reconciliation account data could not be loaded");
  }

  const provisionalRows = provisionalResult.data ?? [];
  const provisionalIds = provisionalRows.map((row) => row.id);
  const [profileResult, privateResult, candidatesResult] = await Promise.all([
    provisionalIds.length
      ? admin
          .from("keluarga_volunteer_profiles")
          .select(
            "volunteer_id, bio, interests, skills, availability_slots, preferred_commitment, onboarding_completed_at",
          )
          .in("volunteer_id", provisionalIds)
      : Promise.resolve({ data: [], error: null }),
    provisionalIds.length
      ? admin
          .from("volunteer_private_details")
          .select(
            "volunteer_id, date_of_birth, postal_code, planning_area, tshirt_size, highest_qualification",
          )
          .in("volunteer_id", provisionalIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .schema("core")
      .from("volunteers")
      .select(
        "id, volunteer_code, display_name, mobile, primary_email_normalized, official_hours_12_months, official_hours_24_months",
      )
      .is("auth_user_id", null)
      .limit(5000),
  ]);

  if (profileResult.error || privateResult.error || candidatesResult.error) {
    throw new Error("Reconciliation profile comparison could not be loaded");
  }

  const accountById = new Map((accountsResult.data ?? []).map((row) => [row.id, row]));
  const provisionalByUser = new Map(provisionalRows.map((row) => [row.auth_user_id, row]));
  const profileByVolunteer = new Map((profileResult.data ?? []).map((row) => [row.volunteer_id, row]));
  const privateByVolunteer = new Map((privateResult.data ?? []).map((row) => [row.volunteer_id, row]));
  const candidateRows = candidatesResult.data ?? [];

  return (
    <main className="page-frame">
      <div className="dashboard-header">
        <div>
          <h1>Volunteer reconciliation</h1>
          <p className="muted">
            Review temporary unverified accounts. Matches are recorded for later
            reconciliation; no historical volunteer record is merged here.
          </p>
        </div>
      </div>

      {success ? (
        <div className="notice notice-success" role="status">
          Review decision saved.
        </div>
      ) : null}
      {error ? (
        <div className="notice notice-error" role="alert">
          That review action could not be saved. Check the fields and try again.
        </div>
      ) : null}

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Review queue</h2>
            <p className="muted">{cases.length} account{cases.length === 1 ? "" : "s"} awaiting review</p>
          </div>
        </div>

        <div className="profile-setup-review-list">
          {cases.map((reviewCase) => {
            const account = accountById.get(reviewCase.auth_user_id);
            const provisional = provisionalByUser.get(reviewCase.auth_user_id);
            const profile = provisional ? profileByVolunteer.get(provisional.id) : undefined;
            const privateDetails = provisional ? privateByVolunteer.get(provisional.id) : undefined;
            const claimedEmail = account?.claimed_email_normalized ?? "";
            const normalizedName = (provisional?.display_name ?? account?.display_name ?? "").trim().toLowerCase();
            const normalizedMobile = (provisional?.mobile ?? "").replace(/\D/g, "");

            const candidates = candidateRows
              .map((candidate) => {
                let score = 0;
                if (
                  claimedEmail &&
                  candidate.primary_email_normalized?.toLowerCase() === claimedEmail
                ) score += 100;
                if (
                  normalizedMobile &&
                  (candidate.mobile ?? "").replace(/\D/g, "") === normalizedMobile
                ) score += 60;
                if (
                  normalizedName &&
                  candidate.display_name?.trim().toLowerCase() === normalizedName
                ) score += 40;
                return { candidate, score };
              })
              .filter(({ score }) => score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 8);

            return (
              <article className="section" key={reviewCase.id}>
                <div className="section-header">
                  <div>
                    <h3>{provisional?.display_name ?? account?.display_name ?? "New volunteer"}</h3>
                    <p className="muted">
                      {claimedEmail || "No claimed email"} · {provisional?.volunteer_code ?? "No KEL code"}
                    </p>
                  </div>
                  <span className="badge">{reviewCase.review_outcome === "refill_required" ? "Changes requested" : "Pending review"}</span>
                </div>

                <div className="form-grid">
                  <div>
                    <strong>Temporary account data</strong>
                    <p>Email: {claimedEmail || "—"} (unverified)</p>
                    <p>Mobile: {provisional?.mobile ?? "—"}</p>
                    <p>Date of birth: {privateDetails?.date_of_birth ?? "—"}</p>
                    <p>Planning area: {privateDetails?.planning_area ?? "—"}</p>
                    <p>Qualification: {privateDetails?.highest_qualification?.replaceAll("_", " ") ?? "—"}</p>
                    <p>Skills: {profile?.skills?.join(", ") || "—"}</p>
                    <p>Interests: {profile?.interests?.join(", ") || "—"}</p>
                  </div>
                  <div>
                    <strong>Possible existing records</strong>
                    {candidates.length ? (
                      <ul>
                        {candidates.map(({ candidate, score }) => (
                          <li key={candidate.id}>
                            <strong>{candidate.display_name ?? "Volunteer"}</strong>{" "}
                            ({candidate.volunteer_code}) — match score {score}
                            <br />
                            <span className="muted">
                              {candidate.primary_email_normalized ?? "no email"} · {candidate.mobile ?? "no mobile"} ·
                              {" "}{candidate.official_hours_24_months ?? 0}h / 24 months
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No likely existing record found from email, mobile or exact name.</p>
                    )}
                  </div>
                </div>

                <div className="form-grid">
                  <form action={approveTemporaryVolunteer} className="phaseone-admin-form">
                    <input type="hidden" name="caseId" value={reviewCase.id} />
                    <h4>Approve as new volunteer</h4>
                    <textarea name="notes" rows={2} maxLength={2000} placeholder="Optional internal notes" />
                    <button className="button button-primary" type="submit">Approve new record</button>
                  </form>

                  <form action={deferExistingVolunteerMatch} className="phaseone-admin-form">
                    <input type="hidden" name="caseId" value={reviewCase.id} />
                    <h4>Record existing volunteer match</h4>
                    <select name="candidateVolunteerId" required defaultValue="">
                      <option value="" disabled>Select a likely record</option>
                      {candidates.map(({ candidate }) => (
                        <option value={candidate.id} key={candidate.id}>
                          {candidate.display_name ?? "Volunteer"} — {candidate.volunteer_code}
                        </option>
                      ))}
                    </select>
                    <textarea name="notes" rows={2} maxLength={2000} placeholder="Why this appears to be the same volunteer" />
                    <button className="button button-secondary" type="submit" disabled={candidates.length === 0}>
                      Save match for later reconciliation
                    </button>
                  </form>
                </div>

                <form action={rejectAndRequestProfileRefill} className="phaseone-admin-form">
                  <input type="hidden" name="caseId" value={reviewCase.id} />
                  <h4>Reject and request profile changes</h4>
                  <fieldset>
                    <legend>Select the sections the volunteer should fill or re-fill</legend>
                    <div className="form-grid">
                      {sectionOptions.map(([value, label]) => (
                        <label key={value}>
                          <input
                            type="checkbox"
                            name="requestedSections"
                            value={value}
                            defaultChecked={(reviewCase.requested_sections ?? []).includes(value)}
                          />{" "}
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="form-field">
                    <label htmlFor={`message-${reviewCase.id}`}>Message to volunteer</label>
                    <textarea
                      id={`message-${reviewCase.id}`}
                      name="message"
                      rows={3}
                      maxLength={2000}
                      required
                      defaultValue={reviewCase.volunteer_message ?? ""}
                      placeholder="Explain what needs to be corrected or completed."
                    />
                  </div>
                  <textarea name="notes" rows={2} maxLength={2000} placeholder="Optional internal review notes" />
                  <button className="button button-secondary" type="submit">
                    Reject & request changes
                  </button>
                </form>
              </article>
            );
          })}
          {cases.length === 0 ? <p>No temporary volunteer accounts require review.</p> : null}
        </div>
      </section>
    </main>
  );
}
