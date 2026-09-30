import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { resubmitProfileReview } from "@/app/account/review/actions";
import { PortalHeader } from "@/components/portal-header";
import { requireActiveAccount } from "@/lib/auth/account-access";
import { getSafeRedirectPath } from "@/lib/security/redirects";

export const metadata: Metadata = { title: "Profile review" };
export const dynamic = "force-dynamic";

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const sectionLabels: Record<string, string> = {
  contact: "Contact details",
  home: "Home area",
  personal: "Personal details",
  interests: "Volunteering interests",
  skills: "Skills",
  availability: "Availability",
  "event-readiness": "Event readiness",
  education: "Education",
  photo: "Profile photo",
  about: "About you",
};

function param(
  values: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function AccountReviewPage({ searchParams }: PageProps) {
  const parameters = await searchParams;
  const nextPath = getSafeRedirectPath(param(parameters, "next"), "/dashboard");
  const { supabase, userId } = await requireActiveAccount("/account/review");

  const result = await supabase
    .schema("core")
    .from("account_link_cases")
    .select(
      "id, status, reason_code, review_outcome, requested_sections, volunteer_message, submitted_for_review_at, resubmitted_at",
    )
    .eq("auth_user_id", userId)
    .in("status", ["pending", "needs_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error("Profile review status could not be loaded");
  }

  if (!result.data) {
    redirect(nextPath);
  }

  const review = result.data;
  const refill = review.review_outcome === "refill_required";
  const requested = review.requested_sections ?? [];
  const success = param(parameters, "success");
  const error = param(parameters, "error");

  return (
    <div className="site-shell">
      <PortalHeader status="Profile review" dashboard />
      <main className="page-frame">
        <section className="section">
          {refill ? (
            <>
              <h1>Please update your volunteer profile</h1>
              <p>
                Volunteer Management reviewed the information in your temporary
                account and needs you to fill or re-fill some details before the
                review can continue.
              </p>
              {review.volunteer_message ? (
                <div className="notice notice-error" role="status">
                  {review.volunteer_message}
                </div>
              ) : null}
              <div className="profile-setup-review-list">
                {requested.map((section: string) => (
                  <Link
                    href={`/profile/setup?step=${encodeURIComponent(section)}&mode=edit`}
                    key={section}
                  >
                    <strong>{sectionLabels[section] ?? section}</strong>
                    <span>Review and update →</span>
                  </Link>
                ))}
              </div>
              <p className="muted">
                Your temporary account remains separate from any historical
                volunteer record. Updating these details does not merge records.
              </p>
              {error ? (
                <div className="notice notice-error" role="alert">
                  Your changes could not be resubmitted. Try again.
                </div>
              ) : null}
              <form action={resubmitProfileReview}>
                <button className="button button-primary" type="submit">
                  I&apos;ve updated these details — resubmit for review
                </button>
              </form>
            </>
          ) : (
            <>
              <h1>Your volunteer profile is under review</h1>
              {success === "resubmitted" ? (
                <div className="notice notice-success" role="status">
                  Your updated profile has been resubmitted to Volunteer Management.
                </div>
              ) : null}
              <p>
                We are keeping this temporary account separate while email ownership
                verification is unavailable. Volunteer Management will review the
                profile and reconcile it later when verified authentication is restored.
              </p>
              <p className="muted">
                You can continue using Keluarga MENDAKI. No historical volunteer
                record, hours, points or badges are being merged automatically.
              </p>
              <Link className="button button-primary" href={nextPath}>
                Continue to Keluarga MENDAKI
              </Link>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
