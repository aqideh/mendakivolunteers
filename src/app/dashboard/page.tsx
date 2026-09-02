import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/dashboard/actions";
import { PortalHeader } from "@/components/portal-header";
import { hasContentManagerRole } from "@/lib/auth/content-access";
import { hasPathwayManagerRole } from "@/lib/auth/pathway-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { createClient } from "@/lib/supabase/server";
import {
  formatYmHubState,
  getVerifiedHours,
  getVerifiedHoursForRecord,
  getYmHubSyncOutcome,
} from "@/lib/ymhub/read-model";
import type { AccountStatus, Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Dashboard",
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
};

type YmHubSyncStatus =
  Database["ymhub"]["Tables"]["volunteer_sync_status"]["Row"];
type YmHubRegistration =
  Database["ymhub"]["Tables"]["registration_snapshots"]["Row"];
type YmHubAttendance =
  Database["ymhub"]["Tables"]["attendance_snapshots"]["Row"];
type YmHubReadModel = Readonly<{
  syncStatus: YmHubSyncStatus | null;
  registrations: YmHubRegistration[];
  attendanceRecords: YmHubAttendance[];
}>;

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
        "id, ymhub_volunteer_id, ymhub_status, source_updated_at, last_synced_at",
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

  let ymHubReadModel: YmHubReadModel | null = null;

  if (volunteer) {
    const [syncResult, registrationsResult, attendanceResult] =
      await Promise.all([
        supabase
          .schema("ymhub")
          .from("volunteer_sync_status")
          .select(
            "volunteer_id, registrations_synced_at, attendance_synced_at, last_attempted_at, last_successful_at, last_failed_at, created_at, updated_at",
          )
          .eq("volunteer_id", volunteer.id)
          .maybeSingle(),
        supabase
          .schema("ymhub")
          .from("registration_snapshots")
          .select(
            "id, volunteer_id, ymhub_registration_id, ymhub_activity_id, activity_title, activity_category, activity_starts_at, activity_ends_at, registered_at, state, source_status, source_updated_at, last_synced_at, created_at, updated_at",
          )
          .eq("volunteer_id", volunteer.id)
          .order("activity_starts_at", { ascending: true }),
        supabase
          .schema("ymhub")
          .from("attendance_snapshots")
          .select(
            "id, volunteer_id, ymhub_attendance_id, ymhub_activity_id, activity_title, activity_category, activity_starts_at, activity_ends_at, state, source_status, verified_hours, verified_at, source_updated_at, last_synced_at, created_at, updated_at",
          )
          .eq("volunteer_id", volunteer.id)
          .order("activity_starts_at", { ascending: false }),
      ]);

    const hasYmHubReadError = Boolean(
      syncResult.error || registrationsResult.error || attendanceResult.error,
    );

    if (hasYmHubReadError) {
      console.error("Unable to load YM Hub read model", {
        syncCode: syncResult.error?.code,
        registrationsCode: registrationsResult.error?.code,
        attendanceCode: attendanceResult.error?.code,
      });
      throw new Error("YM Hub dashboard data could not be loaded");
    }

    if (!registrationsResult.data || !attendanceResult.data) {
      throw new Error("YM Hub queries returned no result set");
    }

    ymHubReadModel = {
      syncStatus: syncResult.data,
      registrations: registrationsResult.data,
      attendanceRecords: attendanceResult.data,
    };
  }

  if (volunteer && !ymHubReadModel) {
    throw new Error("Linked volunteer is missing its YM Hub read-model result");
  }

  const canManageContent = hasContentManagerRole(roles);
  const canManagePathways = hasPathwayManagerRole(roles);
  const syncStatus = ymHubReadModel?.syncStatus ?? null;
  const syncOutcome = getYmHubSyncOutcome(syncStatus);
  const parameters = await searchParams;
  const errorCode = readParameter(parameters, "error");
  const errorMessage = errorCode ? dashboardErrors[errorCode] : undefined;
  const displayName = account.display_name?.trim() || "Volunteer";

  return (
    <div className="site-shell">
      <PortalHeader status="KELUARGA account" dashboard />

      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Your KELUARGA account</p>
            <h1>Welcome, {displayName}</h1>
            <p className="muted">
              Use KELUARGA for Event Guides and volunteer updates. YM Hub remains
              the official system for registration, attendance and verified hours.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-primary" href="/journey">
              Open Event Guide
            </Link>
            <Link className="button button-secondary" href="/opportunities">
              View opportunities
            </Link>
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

        <section className="panel" aria-labelledby="profile-title">
          <p className="eyebrow">Profile</p>
          <h2 id="profile-title">Your KELUARGA profile</h2>
          <p className="muted">
            This login is separate from YM Hub. Use the same email address in both
            systems where possible so your records can be matched reliably.
          </p>
          <dl className="data-list">
            <div className="data-row">
              <dt>Name</dt>
              <dd>{displayName}</dd>
            </div>
            <div className="data-row">
              <dt>Email</dt>
              <dd>{authUser.email ?? "Not available"}</dd>
            </div>
            <div className="data-row">
              <dt>KELUARGA account</dt>
              <dd>
                <span className="status-pill">
                  {accountStatusLabel(account.status)}
                </span>
              </dd>
            </div>
            <div className="data-row">
              <dt>Official volunteer profile</dt>
              <dd>{volunteer ? "Linked to YM Hub" : "Pending next data update"}</dd>
            </div>
            {volunteer?.last_synced_at ? (
              <div className="data-row">
                <dt>Profile last updated</dt>
                <dd>{formatSingaporeDateTime(volunteer.last_synced_at)}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {!volunteer ? (
          <section className="section notice" aria-labelledby="link-title">
            <h2 id="link-title">Official profile matching is in progress</h2>
            <p>
              You can still open Event Guides matched through the verified email
              on an event roster. Your official registration history and verified
              hours will appear after your YM Hub profile is linked through the
              next approved data update.
            </p>
            <Link className="text-link" href="/journey">
              View your Event Guides
            </Link>
          </section>
        ) : null}

        {volunteer && ymHubReadModel ? (
          <section className="section" aria-labelledby="ymhub-title">
            <p className="eyebrow">Official volunteer record</p>
            <h2 id="ymhub-title">Your YM Hub activity</h2>

            {syncOutcome === "not_synced" ? (
              <div className="notice" role="status">
                <h3>Official activity data has not been imported yet</h3>
                <p>
                  Event Guides may still be matched through your current event
                  roster. Registration history, verified attendance and hours will
                  appear after the first successful YM Hub data update.
                </p>
              </div>
            ) : null}

            {syncOutcome === "failed" ? (
              <div className="notice notice-error" role="alert">
                <h3>The latest YM Hub data update did not complete</h3>
                {syncStatus?.last_successful_at ? (
                  <p>
                    Records below, where present, are from the last successful
                    update at {formatSingaporeDateTime(syncStatus.last_successful_at)}.
                  </p>
                ) : (
                  <p>
                    No authoritative update has completed, so official registration
                    and attendance records remain unavailable.
                  </p>
                )}
              </div>
            ) : null}

            {syncStatus?.last_successful_at ? (
              <div className="metric-grid" aria-label="YM Hub summary">
                <article className="metric-card">
                  <span className="metric-value">
                    {ymHubReadModel.registrations.length}
                  </span>
                  <span className="metric-label">Registration records</span>
                </article>
                <article className="metric-card">
                  <span className="metric-value">
                    {
                      ymHubReadModel.attendanceRecords.filter(
                        ({ state }) => state === "verified",
                      ).length
                    }
                  </span>
                  <span className="metric-label">Verified activities</span>
                </article>
                <article className="metric-card">
                  <span className="metric-value">
                    {getVerifiedHours(
                      ymHubReadModel.attendanceRecords,
                    ).toFixed(1)}
                  </span>
                  <span className="metric-label">Verified hours</span>
                </article>
                <article className="metric-card">
                  <span className="metric-value metric-value-date">
                    {formatSingaporeDateTime(syncStatus.last_successful_at)}
                  </span>
                  <span className="metric-label">Last data update</span>
                </article>
              </div>
            ) : null}

            {syncStatus?.registrations_synced_at ? (
              <div className="read-model-section">
                <div className="section-header">
                  <div>
                    <h3>Registrations</h3>
                    <p className="muted">
                      Updated {formatSingaporeDateTime(syncStatus.registrations_synced_at)}
                    </p>
                  </div>
                </div>
                {ymHubReadModel.registrations.length === 0 ? (
                  <div className="panel empty-state">
                    <p>You are not registered for any upcoming events.</p>
                    <Link className="text-link" href="/opportunities">
                      View volunteer opportunities
                    </Link>
                  </div>
                ) : (
                  <div className="record-list">
                    {ymHubReadModel.registrations.map((registration) => (
                      <article className="record-card" key={registration.id}>
                        <div>
                          <p className="record-kicker">
                            {registration.activity_category ?? "Category not supplied"}
                          </p>
                          <h3>{registration.activity_title}</h3>
                          <p className="record-meta">
                            {formatSingaporeDateTime(registration.activity_starts_at)}
                          </p>
                        </div>
                        <span className="status-pill" data-state={registration.state}>
                          {formatYmHubState(registration.state)}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : syncStatus ? (
              <div className="notice read-model-section" role="status">
                Registration records have not completed an authoritative data update.
              </div>
            ) : null}

            {syncStatus?.attendance_synced_at ? (
              <div className="read-model-section">
                <div className="section-header">
                  <div>
                    <h3>Attendance</h3>
                    <p className="muted">
                      Updated {formatSingaporeDateTime(syncStatus.attendance_synced_at)}
                    </p>
                  </div>
                </div>
                {ymHubReadModel.attendanceRecords.length === 0 ? (
                  <p className="empty-state">
                    YM Hub returned no official attendance records in the latest
                    successful update.
                  </p>
                ) : (
                  <div className="record-list">
                    {ymHubReadModel.attendanceRecords.map((attendance) => (
                      <article className="record-card" key={attendance.id}>
                        <div>
                          <p className="record-kicker">
                            {attendance.activity_category ?? "Category not supplied"}
                          </p>
                          <h3>{attendance.activity_title}</h3>
                          <p className="record-meta">
                            {formatSingaporeDateTime(attendance.activity_starts_at)}
                            {attendance.state === "verified" ? (
                              <>
                                {" "}· {getVerifiedHoursForRecord(attendance).toFixed(1)}
                                {" "}verified hours
                              </>
                            ) : null}
                          </p>
                        </div>
                        <span className="status-pill" data-state={attendance.state}>
                          {formatYmHubState(attendance.state)}
                        </span>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : syncStatus ? (
              <div className="notice read-model-section" role="status">
                Attendance records have not completed an authoritative data update.
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="section" aria-labelledby="available-title">
          <p className="eyebrow">Volunteer services</p>
          <h2 id="available-title">What you can do in KELUARGA</h2>
          <div className="card-grid">
            <article className="card">
              <h3>Event Guide</h3>
              <p className="muted">
                View the briefing, reporting time, directions and event-day steps
                for activities matched to your registration or roster.
              </p>
              <Link className="text-link" href="/journey">
                Open Event Guide
              </Link>
            </article>
            <article className="card">
              <h3>Volunteer opportunities</h3>
              <p className="muted">
                Browse opportunities in KELUARGA, then continue to the official
                registration portal using its separate sign-in.
              </p>
              <Link className="text-link" href="/opportunities">
                Browse opportunities
              </Link>
            </article>
            <article className="card">
              <h3>Volunteer news</h3>
              <p className="muted">
                Read MENDAKI volunteer announcements and programme updates.
              </p>
              <Link className="text-link" href="/news">
                Read news
              </Link>
            </article>
          </div>
        </section>

        {canManageContent || canManagePathways ? (
          <section className="section" aria-labelledby="staff-tools-title">
            <p className="eyebrow">Staff tools</p>
            <h2 id="staff-tools-title">Management access</h2>
            <div className="card-grid">
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
              {canManagePathways ? (
                <article className="card">
                  <h3>Volunteer pathways</h3>
                  <p className="muted">
                    Edit and publish the volunteer pathway map.
                  </p>
                  <Link className="text-link" href="/admin/pathways">
                    Manage pathway map
                  </Link>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="site-footer">
        KELUARGA and YM Hub use separate sign-ins. Official registration and
        verified attendance remain in YM Hub.
      </footer>
    </div>
  );
}
