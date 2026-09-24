import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/dashboard/actions";
import { KeluargaRegistrationSummary } from "@/components/keluarga-registration-summary";
import { PortalHeader } from "@/components/portal-header";
import { ProfileEditor } from "@/components/profile-editor";
import { ProfilePhotoUploader } from "@/components/profile-photo-uploader";
import { VolunteerJourneySummary } from "@/components/volunteer-journey-summary";
import { hasContentManagerRole } from "@/lib/auth/content-access";
import { hasGamificationManagerRole } from "@/lib/auth/gamification-access";
import { hasPathwayManagerRole } from "@/lib/auth/pathway-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { profilePhotoBucket } from "@/lib/media/storage";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";
import type { AccountStatus, Database } from "@/types/database";

export const metadata: Metadata = {
  title: "My Profile",
};

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const dashboardErrors: Record<string, string> = {
  cms_access_denied: "Your account does not have permission to manage content.",
  cms_authorization_unavailable:
    "Content-management permissions could not be checked. No content was changed.",
  pathway_access_denied:
    "Your account does not have permission to manage volunteer pathways.",
  pathway_authorization_unavailable:
    "Pathway-management permissions could not be checked. No pathway data was changed.",
  gamification_access_denied:
    "Your account does not have permission to manage volunteer points.",
  gamification_authorization_unavailable:
    "Points-management permissions could not be checked. No point data was changed.",
  profile_validation:
    "Enter a valid full name and mobile number.",
  profile_update_failed:
    "Your profile could not be updated. No profile data was changed.",
  registration_withdraw_invalid:
    "The registration could not be identified.",
  registration_withdraw_started:
    "Attendance has already started for this registration. Contact Volunteer Management if a correction is needed.",
  registration_withdraw_failed:
    "The registration could not be withdrawn. No registration data was changed.",
};

function readParameter(
  parameters: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = parameters[name];
  return Array.isArray(value) ? value[0] : value;
}

function accountStatusLabel(status: AccountStatus): string {
  switch (status) {
    case "pending_link":
      return "Profile matching in progress";
    case "active":
      return "Active";
    case "suspended":
      return "Suspended";
    case "closed":
      return "Closed";
  }
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login");
  }

  const [userResult, accountResult, volunteerResult, rolesResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .schema("core")
      .from("user_accounts")
      .select("id, status, display_name, created_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .schema("core")
      .from("volunteers")
      .select(
        "id, volunteer_code, display_name, mobile, profile_photo_path",
      )
      .eq("auth_user_id", userId)
      .maybeSingle(),
    supabase
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .order("role"),
  ]);

  const hasReadError = Boolean(
    userResult.error ||
      accountResult.error ||
      volunteerResult.error ||
      rolesResult.error,
  );

  if (hasReadError) {
    console.error("Unable to load volunteer dashboard", {
      userCode: userResult.error?.code,
      accountCode: accountResult.error?.code,
      volunteerCode: volunteerResult.error?.code,
      rolesCode: rolesResult.error?.code,
    });
    throw new Error("Volunteer dashboard data could not be loaded");
  }

  if (!rolesResult.data) {
    throw new Error("Volunteer roles query returned no result set");
  }

  const account = accountResult.data;
  const volunteer = volunteerResult.data;
  const roles = rolesResult.data.map(({ role }) => role);
  const authUser = userResult.data.user;

  if (!account || !authUser || roles.length === 0) {
    throw new Error("Volunteer account invariants are incomplete");
  }

  let approvedContributions: Array<{
    id: string;
    approved_minutes: number;
    occurred_at: string;
  }> = [];

  if (volunteer) {
    const appDataClient = supabase as unknown as SupabaseClient;
    const contributionResult = await appDataClient
      .from("volunteer_contributions")
      .select("id, approved_minutes, occurred_at")
      .eq("volunteer_id", volunteer.id)
      .eq("status", "approved")
      .order("occurred_at", { ascending: false });

    if (contributionResult.error || !contributionResult.data) {
      console.error("Unable to load approved contribution hours", {
        code: contributionResult.error?.code,
      });
      throw new Error("Approved contribution hours could not be loaded");
    }

    approvedContributions = contributionResult.data as Array<{
      id: string;
      approved_minutes: number;
      occurred_at: string;
    }>;
  }

  const isAdmin = roles.includes("admin");
  const canManageContent = hasContentManagerRole(roles);
  const canManageGamification = hasGamificationManagerRole(roles);
  const canManagePathways = hasPathwayManagerRole(roles);
  const parameters = await searchParams;
  const errorCode = readParameter(parameters, "error");
  const successCode = readParameter(parameters, "success");
  const profileMode = readParameter(parameters, "profile");
  const errorMessage = errorCode ? dashboardErrors[errorCode] : undefined;
  const displayName =
    volunteer?.display_name?.trim() || account.display_name?.trim() || "Volunteer";

  let profilePhotoUrl: string | null = null;
  if (volunteer?.profile_photo_path) {
    const { data, error } = await getPhaseOneAdminClient()
      .storage
      .from(profilePhotoBucket)
      .createSignedUrl(volunteer.profile_photo_path, 60 * 60);

    if (error) {
      console.error("Unable to create profile photo URL", {
        message: error.message,
        volunteerId: volunteer.id,
      });
    } else {
      profilePhotoUrl = data.signedUrl;
    }
  }

  return (
    <div className="site-shell">
      <PortalHeader status="KELUARGA account" dashboard />

      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Your KELUARGA account</p>
            <h1>Welcome, {displayName}</h1>
            <p className="muted">
              Use KELUARGA for registrations, Event Guides and volunteer updates.
              MakLom supports Volunteer Management with the shared volunteer profile,
              reviewed contribution hours and longitudinal records.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-primary" href="/journey">
              Open Event Guide
            </Link>
            <Link className="button button-secondary" href="/opportunities">
              View opportunities
            </Link>
            {isAdmin ? (
              <Link className="button button-secondary" href="/admin">
                Admin
              </Link>
            ) : null}
            {canManageContent ? (
              <Link className="button button-secondary" href="/admin/content">
                Manage content
              </Link>
            ) : null}
            {canManagePathways ? (
              <Link className="button button-secondary" href="/admin/pathways">
                Manage pathways
              </Link>
            ) : null}
            <form action={signOut}>
              <button className="button button-secondary" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>

        {errorMessage ? (
          <div className="notice notice-error" role="alert">
            {errorMessage}
          </div>
        ) : null}
        {successCode === "profile_updated" ? (
          <div className="notice notice-success" role="status">
            Your KELUARGA profile has been updated.
          </div>
        ) : null}
        {successCode === "registration_withdrawn" ? (
          <div className="notice notice-success" role="status">
            Your programme registration has been withdrawn.
          </div>
        ) : null}

        <section className="panel" aria-labelledby="profile-title">
          <p className="eyebrow">Profile</p>
          <h2 id="profile-title">Your KELUARGA profile</h2>
          <p className="muted">
            This is your KELUARGA volunteer account, linked through the shared
            volunteer identity used by KELUARGA and MakLom.
          </p>
          {volunteer ? (
            <ProfilePhotoUploader
              displayName={displayName}
              imageUrl={profilePhotoUrl}
            />
          ) : null}
          <dl className="data-list">
            <div className="data-row">
              <dt>Name</dt>
              <dd>{displayName}</dd>
            </div>
            <div className="data-row">
              <dt>Email</dt>
              <dd>{authUser.email ?? "Not available"}</dd>
            </div>
            {volunteer?.volunteer_code ? (
              <div className="data-row">
                <dt>Volunteer ID</dt>
                <dd><strong>{volunteer.volunteer_code}</strong></dd>
              </div>
            ) : null}
            <div className="data-row">
              <dt>Mobile</dt>
              <dd>{volunteer?.mobile ?? "Not provided"}</dd>
            </div>
            <div className="data-row">
              <dt>KELUARGA account</dt>
              <dd>
                <span className="status-pill">
                  {accountStatusLabel(account.status)}
                </span>
              </dd>
            </div>
          </dl>
          {volunteer ? (
            <details className="phaseone-disclosure" open={profileMode === "edit"}>
              <summary>Edit profile</summary>
              <div className="phaseone-disclosure-body">
                <ProfileEditor
                  displayName={displayName}
                  mobile={volunteer.mobile}
                />
              </div>
            </details>
          ) : null}
        </section>

        {volunteer ? <VolunteerJourneySummary /> : null}

        {volunteer ? (
          <KeluargaRegistrationSummary volunteerId={volunteer.id} />
        ) : null}

        {volunteer ? (
          <section className="section panel" aria-labelledby="contribution-hours-title">
            <h2 id="contribution-hours-title">Approved contribution hours</h2>
            <div className="metric-grid">
              <article className="metric-card">
                <span className="metric-value">
                  {(approvedContributions.reduce(
                    (total, contribution) =>
                      total + Number(contribution.approved_minutes ?? 0),
                    0,
                  ) / 60).toFixed(1)}
                </span>
                <span className="metric-label">Approved volunteer hours</span>
              </article>
              <article className="metric-card">
                <span className="metric-value">{approvedContributions.length}</span>
                <span className="metric-label">Approved contribution records</span>
              </article>
            </div>
            <p className="muted">
              KELUARGA records operational attendance. Volunteer Management reviews
              contribution records in MakLom before hours appear here as approved.
            </p>
          </section>
        ) : null}

        {!volunteer ? (
          <section className="section notice" aria-labelledby="link-title">
            <h2 id="link-title">Volunteer profile setup incomplete</h2>
            <p>
              Your account is active, but its canonical volunteer profile is not yet
              available. Contact Volunteer Management so the shared identity can be resolved.
            </p>
            <Link className="text-link" href="/journey">
              View your Event Guides
            </Link>
          </section>
        ) : null}

        <section className="section" aria-labelledby="available-title">
          <p className="eyebrow">Your volunteer journey</p>
          <h2 id="available-title">Explore from My Profile</h2>
          <div className="card-grid">
            <article className="card">
              <h3>Event Guides</h3>
              <p className="muted">
                View reporting times, briefings, directions and event-day steps
                for activities matched to your registration or roster.
              </p>
              <Link className="text-link" href="/journey">
                View Event Guides
              </Link>
            </article>
            <article className="card">
              <h3>Pathways</h3>
              <p className="muted">
                Explore how you can grow your contribution, skills and involvement
                across KELUARGA volunteer pathways.
              </p>
              <Link className="text-link" href="/pathways">
                Explore Pathways
              </Link>
            </article>
            <article className="card">
              <h3>Points</h3>
              <p className="muted">
                View your KELUARGA points and recognition history from approved
                contribution activity and staff-recognition awards.
              </p>
              <Link className="text-link" href="/points">
                View Points
              </Link>
            </article>
          </div>
        </section>

        {isAdmin || canManageContent || canManageGamification || canManagePathways ? (
          <section className="section" aria-labelledby="staff-tools-title">
            <p className="eyebrow">Staff tools</p>
            <h2 id="staff-tools-title">Management access</h2>
            <div className="card-grid">
              {isAdmin ? (
                <article className="card">
                  <h3>Administration</h3>
                  <p className="muted">
                    Open the central staff administration hub, including staff access
                    and operational tools.
                  </p>
                  <div className="staff-tool-links">
                    <Link className="text-link" href="/admin">
                      Open admin
                    </Link>
                    <Link className="text-link" href="/admin/staff">
                      Manage staff access
                    </Link>
                  </div>
                </article>
              ) : null}
              {canManageContent ? (
                <article className="card">
                  <h3>Content management</h3>
                  <p className="muted">
                    Prepare, review and publish opportunity and news content.
                  </p>
                  <Link className="text-link" href="/admin/content">
                    Open content management
                  </Link>
                </article>
              ) : null}
              {canManageGamification ? (
                <article className="card">
                  <h3>Points management</h3>
                  <p className="muted">
                    Award audited staff-recognition points to KELUARGA volunteers.
                  </p>
                  <div className="staff-tool-links">
                    <Link className="text-link" href="/admin/points">
                      Manage volunteer points
                    </Link>
                    <Link className="text-link" href="/admin/badges">
                      Manage badges
                    </Link>
                  </div>
                </article>
              ) : null}
              {canManagePathways ? (
                <article className="card">
                  <h3>Volunteer pathways</h3>
                  <p className="muted">
                    Edit and publish the volunteer pathway map.
                  </p>
                  <div className="staff-tool-links">
                    <Link className="text-link" href="/admin/pathways">
                      Manage pathway map
                    </Link>
                    <Link className="text-link" href="/admin/pathways/positions">
                      Manage volunteer positions
                    </Link>
                  </div>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="site-footer">
        <span>Keluarga MENDAKI manages volunteer-facing registrations and event operations. MakLom supports Volunteer Management with reviewed longitudinal records and approved contribution hours.</span>
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
