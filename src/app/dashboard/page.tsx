import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/dashboard/actions";
import { PortalHeader } from "@/components/portal-header";
import { hasContentManagerRole } from "@/lib/auth/content-access";
import { createClient } from "@/lib/supabase/server";

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

  const canManageContent = hasContentManagerRole(roles);
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
