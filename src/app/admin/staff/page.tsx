import type { Metadata } from "next";
import Link from "next/link";

import { StaffInviteForm } from "@/app/admin/staff/staff-invite-form";
import { StaffRoleEditor } from "@/app/admin/staff/staff-role-editor";
import { StaffSetupLinkForm } from "@/app/admin/staff/staff-setup-link-form";
import { PortalHeader } from "@/components/portal-header";
import { requireAdmin } from "@/lib/auth/staff-access";
import {
  staffInviteRoleOptions,
  staffInviteRoleValues,
  type StaffInviteRole,
} from "@/lib/auth/staff-roles";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import type { AccountStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "Manage staff access",
};

export const dynamic = "force-dynamic";

type StaffAccount = Readonly<{
  id: string;
  email: string;
  status: AccountStatus;
  role: StaffInviteRole;
  lastSignInAt: string | null;
}>;

async function loadStaffAccounts(): Promise<StaffAccount[]> {
  const admin = getPhaseOneAdminClient();
  const [accountsResult, rolesResult, usersResult] = await Promise.all([
    admin
      .schema("core")
      .from("user_accounts")
      .select("id, status"),
    admin
      .schema("core")
      .from("user_roles")
      .select("user_id, role")
      .in("role", [...staffInviteRoleValues]),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);

  if (accountsResult.error || rolesResult.error || usersResult.error) {
    console.error("Unable to load staff access records", {
      accountCode: accountsResult.error?.code,
      roleCode: rolesResult.error?.code,
      userCode: usersResult.error?.code,
    });
    throw new Error("Staff access records could not be loaded");
  }

  const accountsById = new Map(
    (accountsResult.data ?? []).map((account) => [account.id, account.status]),
  );
  const roleByUserId = new Map<string, StaffInviteRole>();

  for (const record of rolesResult.data ?? []) {
    roleByUserId.set(record.user_id, record.role as StaffInviteRole);
  }

  return usersResult.data.users
    .flatMap((user) => {
      const role = roleByUserId.get(user.id);
      const status = accountsById.get(user.id);

      if (!user.email || !role || !status) return [];

      return [
        {
          id: user.id,
          email: user.email,
          status: status as AccountStatus,
          role,
          lastSignInAt: user.last_sign_in_at ?? null,
        },
      ];
    })
    .sort((left, right) => left.email.localeCompare(right.email));
}

export default async function StaffAccessPage() {
  await requireAdmin();
  const staffAccounts = await loadStaffAccounts();

  return (
    <div className="site-shell">
      <PortalHeader status="Staff access" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <h1>Manage staff access</h1>
            <p className="muted">
              Assign one KELUARGA access level to each staff account. Admin includes
              MakLom administrator access; the other levels do not grant MakLom access.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/account/password">
              Change my password
            </Link>
            <Link className="button button-primary" href="/admin/events">
              Event operations
            </Link>
          </div>
        </div>

        <section className="panel" aria-labelledby="role-reference-title">
          <div className="section-header">
            <div>
              <h2 id="role-reference-title">KELUARGA roles &amp; permissions</h2>
              <p className="muted">
                Access levels are hierarchical. Admin is the only level that manages
                staff access and receives MakLom access.
              </p>
            </div>
          </div>
          <dl className="data-list">
            {staffInviteRoleOptions.map((option) => (
              <div className="data-row" key={option.value}>
                <dt>{option.label}</dt>
                <dd>{option.description}</dd>
              </div>
            ))}
          </dl>
        </section>

        <StaffInviteForm />

        <div className="notice" role="status">
          Use the emailed setup flow by default. Manual setup links remain available
          as an administrative recovery option and should only be shared directly
          with the intended staff member.
        </div>

        <div className="table-wrap">
          <table className="content-table">
            <thead>
              <tr>
                <th>Staff account</th>
                <th>Roles &amp; permissions</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th>Setup access</th>
              </tr>
            </thead>
            <tbody>
              {staffAccounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <strong>{account.email}</strong>
                    <span className="table-subtext">{account.id}</span>
                  </td>
                  <td>
                    <StaffRoleEditor
                      email={account.email}
                      role={account.role}
                      userId={account.id}
                    />
                  </td>
                  <td>
                    <span className="status-pill">{account.status}</span>
                  </td>
                  <td>
                    {account.lastSignInAt
                      ? formatSingaporeDateTime(account.lastSignInAt)
                      : "Never"}
                  </td>
                  <td>
                    <StaffSetupLinkForm userId={account.id} />
                  </td>
                </tr>
              ))}
              {staffAccounts.length === 0 ? (
                <tr>
                  <td colSpan={5}>No approved staff accounts were found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
