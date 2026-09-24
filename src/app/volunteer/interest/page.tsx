import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { createClient } from "@/lib/supabase/server";
import {
  submitRecruitmentApplication,
  withdrawRecruitmentApplication,
} from "./actions";

import styles from "../role-landing.module.css";

export const metadata: Metadata = {
  title: "Start your volunteering journey",
  description:
    "Tell KELUARGA MENDAKI how you would like to contribute and begin your volunteering journey.",
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type RecruitmentApplication = {
  id: string;
  status: string;
  interest_area: string;
  motivation: string;
  skills_experience: string | null;
  availability_notes: string | null;
  referral_source: string | null;
  submitted_at: string;
  review_note: string | null;
};

function parameter(
  values: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function validArea(value: string | undefined): string {
  return ["general", "mentor", "coach", "facilitator", "specialist", "not_sure"].includes(
    value ?? "",
  )
    ? value!
    : "general";
}

function statusLabel(status: string): string {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "reviewing":
      return "Under review";
    case "accepted":
      return "Accepted";
    case "not_selected":
      return "Closed";
    case "withdrawn":
      return "Withdrawn";
    default:
      return status;
  }
}

export default async function VolunteerInterestPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requestedArea = validArea(parameter(params, "area"));
  const success = parameter(params, "success");
  const error = parameter(params, "error");

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(claimsData?.claims?.sub);

  let latest: RecruitmentApplication | null = null;
  if (isSignedIn) {
    const client = supabase as unknown as SupabaseClient;
    const result = await client
      .from("keluarga_recruitment_applications")
      .select(
        "id, status, interest_area, motivation, skills_experience, availability_notes, referral_source, submitted_at, review_note",
      )
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) {
      console.error("Unable to load recruitment application", {
        code: result.error.code,
      });
    } else {
      latest = result.data as RecruitmentApplication | null;
    }
  }

  const activeApplication =
    latest && ["submitted", "reviewing"].includes(latest.status) ? latest : null;
  const acceptedApplication = latest?.status === "accepted" ? latest : null;
  const formArea = activeApplication?.interest_area ?? requestedArea;

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Start volunteering" lite />
      <main className={styles.frame}>
        <Link className={styles.backLink} href="/">
          ← Back to volunteering roles
        </Link>

        <section className={styles.hero}>
          <p className={styles.eyebrow}>Join KELUARGA MENDAKI</p>
          <h1>Start your volunteering journey with us.</h1>
          <p className={styles.lede}>
            Tell us what you care about, what you can contribute and when you are
            generally available. Volunteer Management will use this to understand your
            interests and recommend suitable roles and programmes.
          </p>
        </section>

        {success === "application_submitted" ? (
          <div className="notice notice-success" role="status">
            Your volunteering interest has been submitted to Volunteer Management.
          </div>
        ) : null}
        {success === "application_withdrawn" ? (
          <div className="notice notice-success" role="status">
            Your volunteering interest has been withdrawn.
          </div>
        ) : null}
        {error ? (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        ) : null}

        {!isSignedIn ? (
          <section className="panel">
            <p className="eyebrow">KELUARGA account</p>
            <h2>Sign in to continue.</h2>
            <p className="muted">
              Your KELUARGA volunteer profile lets us keep your recruitment,
              registrations, activity records, pathways and recognition together.
            </p>
            <Link
              className="button button-primary"
              href={`/login?next=${encodeURIComponent(
                `/volunteer/interest?area=${requestedArea}`,
              )}`}
            >
              Login or create an account
            </Link>
          </section>
        ) : acceptedApplication ? (
          <section className="panel">
            <p className="eyebrow">Recruitment status</p>
            <h2>Your volunteering interest has been accepted.</h2>
            <p className="muted">
              Volunteer Management has completed this intake. You can now browse
              current opportunities and register for suitable programmes.
            </p>
            {acceptedApplication.review_note ? (
              <p>{acceptedApplication.review_note}</p>
            ) : null}
            <Link className="button button-primary" href="/opportunities">
              Explore opportunities
            </Link>
          </section>
        ) : (
          <>
            {latest ? (
              <section className="panel">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">Current intake</p>
                    <h2>{statusLabel(latest.status)}</h2>
                  </div>
                  <span className="status-pill" data-state={latest.status}>
                    {statusLabel(latest.status)}
                  </span>
                </div>
                {latest.review_note ? <p>{latest.review_note}</p> : null}
                {activeApplication ? (
                  <form action={withdrawRecruitmentApplication}>
                    <input
                      name="applicationId"
                      type="hidden"
                      value={activeApplication.id}
                    />
                    <button className="button button-secondary" type="submit">
                      Withdraw application
                    </button>
                  </form>
                ) : null}
              </section>
            ) : null}

            <section className="panel" aria-labelledby="interest-form-title">
              <p className="eyebrow">
                {activeApplication ? "Update your details" : "Volunteer interest"}
              </p>
              <h2 id="interest-form-title">
                {activeApplication
                  ? "Keep your volunteering profile current."
                  : "Tell us how you would like to contribute."}
              </h2>
              <form action={submitRecruitmentApplication} className="phaseone-admin-form">
                <div className="form-field">
                  <label htmlFor="interestArea">I am interested in</label>
                  <select
                    defaultValue={formArea}
                    id="interestArea"
                    name="interestArea"
                    required
                  >
                    <option value="general">General volunteering</option>
                    <option value="mentor">Mentoring</option>
                    <option value="coach">Coaching</option>
                    <option value="facilitator">Facilitation / befriending</option>
                    <option value="specialist">Specialist / professional contribution</option>
                    <option value="not_sure">I am not sure yet</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="motivation">Why would you like to volunteer?</label>
                  <textarea
                    defaultValue={activeApplication?.motivation ?? ""}
                    id="motivation"
                    maxLength={2000}
                    minLength={10}
                    name="motivation"
                    required
                    rows={5}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="skillsExperience">
                    Skills, experience or interests
                  </label>
                  <textarea
                    defaultValue={activeApplication?.skills_experience ?? ""}
                    id="skillsExperience"
                    maxLength={3000}
                    name="skillsExperience"
                    rows={5}
                  />
                  <p className="muted">
                    Include professional skills, community experience, languages,
                    hobbies or causes you are interested in.
                  </p>
                </div>

                <div className="form-field">
                  <label htmlFor="availabilityNotes">General availability</label>
                  <textarea
                    defaultValue={activeApplication?.availability_notes ?? ""}
                    id="availabilityNotes"
                    maxLength={1500}
                    name="availabilityNotes"
                    placeholder="e.g. Saturdays, weekday evenings, school holidays"
                    rows={3}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="referralSource">How did you hear about us?</label>
                  <input
                    defaultValue={activeApplication?.referral_source ?? ""}
                    id="referralSource"
                    maxLength={300}
                    name="referralSource"
                  />
                </div>

                <button className="button button-primary" type="submit">
                  {activeApplication ? "Update volunteering interest" : "Submit interest"}
                </button>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
