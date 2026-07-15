import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/dashboard/actions";
import { PortalHeader } from "@/components/portal-header";
import { hasContentManagerRole } from "@/lib/auth/content-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { createClient } from "@/lib/supabase/server";
import {
  formatYmHubState,
  getVerifiedHours,
  getVerifiedHoursForRecord,
  getYmHubSyncOutcome,
} from "@/lib/ymhub/read-model";
import type { Database } from "@/types/database";

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

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login");
  }

  const [accountResult, volunteerResult, rolesResult] = await Promise.all([
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
    accountResult.error || volunteerResult.error || rolesResult.error,
  );

  if (hasReadError) {
    console.error("Unable to load volunteer dashboard", {
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

  if (!account || roles.length === 0) {
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
  const syncStatus = ymHubReadModel?.syncStatus ?? null;
  const syncOutcome = getYmHubSyncOutcome(syncStatus);
  const parameters = await searchParams;
  const errorCode = readParameter(parameters, "error");
  const errorMessage = errorCode ? dashboardErrors[errorCode] : undefined;

  return (
    <div className="site-shell">
      <PortalHeader status="Authenticated volunteer view" dashboard />

      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Volunteer account</p>
            <h1>Volunteer dashboard</h1>
            <p className="muted">
              Review your portal identity link and access volunteer services.
            </p>
          </div>
          <div className="actions">
            {canManageContent ? (
              <Link className="button button-primary" href="/admin/content">
                Manage content
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

        <section className="panel" aria-labelledby="identity-title">
          <p className="eyebrow">Identity boundary</p>
          <h2 id="identity-title">Account and YM Hub link</h2>
          <dl className="data-list">
            <div className="data-row">
              <dt>Supabase user ID</dt>
              <dd>{userId}</dd>
            </div>
            <div className="data-row">
              <dt>Account status</dt>
              <dd>
                <span className="status-pill">
                  {account.status}
                </span>
              </dd>
            </div>
            <div className="data-row">
              <dt>YM Hub volunteer ID</dt>
              <dd>{volunteer?.ymhub_volunteer_id ?? "Not linked"}</dd>
            </div>
            <div className="data-row">
              <dt>YM Hub status</dt>
              <dd>{volunteer?.ymhub_status ?? "Not available"}</dd>
            </div>
            <div className="data-row">
              <dt>Application roles</dt>
              <dd>{roles.join(", ")}</dd>
            </div>
          </dl>
        </section>

        {!volunteer ? (
          <section className="section notice" aria-labelledby="link-title">
            <h2 id="link-title">Volunteer identity not linked</h2>
            <p>
              A controlled linking workflow will match this authenticated account
              to the authoritative YM Hub volunteer ID. Volunteers cannot claim an
              ID by entering it directly.
            </p>
          </section>
        ) : null}

        {volunteer && ymHubReadModel ? (
          <section className="section" aria-labelledby="ymhub-title">
            <p className="eyebrow">Authoritative volunteer records</p>
            <h2 id="ymhub-title">Your YM Hub activity</h2>

            {syncOutcome === "not_synced" ? (
              <div className="notice" role="status">
                <h3>YM Hub data has not been synchronised</h3>
                <p>
                  Registration and attendance records are unavailable. The portal
                  does not show substitute data while the first authoritative sync
                  is pending.
                </p>
              </div>
            ) : null}

            {syncOutcome === "failed" ? (
              <div className="notice notice-error" role="alert">
                <h3>The latest YM Hub sync failed</h3>
                {syncStatus?.last_successful_at ? (
                  <p>
                    Records below, where present, are from the last successful
                    sync at {formatSingaporeDateTime(syncStatus.last_successful_at)}.
                    No replacement records have been generated.
                  </p>
                ) : (
                  <p>
                    No authoritative sync has completed, so registration and
                    attendance records remain unavailable.
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
                  <span className="metric-label">Last successful sync</span>
                </article>
              </div>
            ) : null}

            {syncStatus?.registrations_synced_at ? (
              <div className="read-model-section">
                <div className="section-header">
                  <div>
                    <h3>Registrations</h3>
                    <p className="muted">
                      Synced {formatSingaporeDateTime(syncStatus.registrations_synced_at)}
                    </p>
                  </div>
                </div>
                {ymHubReadModel.registrations.length === 0 ? (
                  <p className="empty-state">
                    YM Hub returned no registration records in the last successful
                    registration sync.
                  </p>
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
                Registration records have not completed an authoritative sync.
              </div>
            ) : null}

            {syncStatus?.attendance_synced_at ? (
              <div className="read-model-section">
                <div className="section-header">
                  <div>
                    <h3>Attendance</h3>
                    <p className="muted">
                      Synced {formatSingaporeDateTime(syncStatus.attendance_synced_at)}
                    </p>
                  </div>
                </div>
                {ymHubReadModel.attendanceRecords.length === 0 ? (
                  <p className="empty-state">
                    YM Hub returned no attendance records in the last successful
                    attendance sync.
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
                Attendance records have not completed an authoritative sync.
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="section" aria-labelledby="available-title">
          <p className="eyebrow">Available modules</p>
          <h2 id="available-title">Volunteer content</h2>
          <div className="card-grid">
            <article className="card">
              <h3>Opportunity discovery</h3>
              <p className="muted">
                Browse app-managed listings and continue to YM Hub when ready to
                register.
              </p>
              <Link className="text-link" href="/opportunities">
                Browse opportunities
              </Link>
            </article>
            <article className="card">
              <h3>Volunteer news</h3>
              <p className="muted">
                Read portal announcements managed independently of official CRM
                records.
              </p>
              <Link className="text-link" href="/news">
                Read news
              </Link>
            </article>
            <article className="card">
              <h3>Native CMS</h3>
              <p className="muted">
                Editors prepare drafts. Publishers schedule, publish, and archive
                content with revision history.
              </p>
              {canManageContent ? (
                <Link className="text-link" href="/admin/content">
                  Open content management
                </Link>
              ) : (
                <span className="muted">Staff permission required</span>
              )}
            </article>
          </div>
        </section>

        <section className="section" aria-labelledby="next-title">
          <p className="eyebrow">Next delivery slices</p>
          <h2 id="next-title">Attendance and verified rewards</h2>
          <div className="card-grid">
            <article className="card">
              <h3>Attendance capture</h3>
              <p className="muted">
                Check-in and staff handoff records that remain distinct from
                official YM Hub verification.
              </p>
            </article>
            <article className="card">
              <h3>Verified rewards</h3>
              <p className="muted">
                On-demand downstream attendance checks and idempotent points from
                verified YM Hub records.
              </p>
            </article>
            <article className="card">
              <h3>Referrals</h3>
              <p className="muted">
                Random referral codes with rewards only after a referred volunteer
                reaches a verified milestone.
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        Official registration and verified attendance remain in YM Hub.
      </footer>
    </div>
  );
}
