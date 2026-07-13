import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/dashboard/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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

  const account = accountResult.data;
  const volunteer = volunteerResult.data;
  const roles = rolesResult.data?.map(({ role }) => role) ?? [];
  const hasReadError = Boolean(
    accountResult.error || volunteerResult.error || rolesResult.error,
  );

  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark" aria-hidden="true">
            MV
          </span>
          <span>MENDAKI Volunteer Portal</span>
        </Link>
        <p className="header-status">Authenticated foundation view</p>
      </header>

      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Volunteer account</p>
            <h1>Foundation dashboard</h1>
            <p className="muted">
              This screen verifies authentication, identity isolation, and
              row-level database access before engagement features are added.
            </p>
          </div>
          <form action={signOut}>
            <button className="button button-secondary" type="submit">
              Sign out
            </button>
          </form>
        </div>

        {hasReadError ? (
          <div className="notice" role="status">
            <h2>Database setup is incomplete</h2>
            <p>
              Apply the Phase 1 Supabase migration, expose the core schema, and
              refresh this page.
            </p>
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
                  {account?.status ?? "pending setup"}
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
              <dd>{roles.length > 0 ? roles.join(", ") : "volunteer"}</dd>
            </div>
          </dl>
        </section>

        {!volunteer ? (
          <section className="section notice" aria-labelledby="link-title">
            <h2 id="link-title">Volunteer identity not linked</h2>
            <p>
              This is expected for a newly created Phase 1 account. A later
              linking workflow will match the authenticated account to the
              authoritative YM Hub volunteer ID without allowing users to claim
              an ID directly.
            </p>
          </section>
        ) : null}

        <section className="section" aria-labelledby="next-title">
          <p className="eyebrow">Next delivery slices</p>
          <h2 id="next-title">Ready for feature modules</h2>
          <div className="card-grid">
            <article className="card">
              <h3>Opportunity and news CMS</h3>
              <p className="muted">
                App-owned publishing, revisions, approvals, and YM Hub
                registration link-outs.
              </p>
            </article>
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
                On-demand downstream attendance checks and idempotent points
                from verified YM Hub records.
              </p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
