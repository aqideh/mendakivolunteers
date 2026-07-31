import type { Metadata } from "next";
import Link from "next/link";

import { StaffSetupLinkForm } from "@/app/admin/staff/staff-setup-link-form";
import { PortalHeader } from "@/components/portal-header";
import { requireAdmin } from "@/lib/auth/staff-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import type { AccountStatus, AppRole } from "@/types/database";

export const metadata: Metadata = {
  title: "Manage staff access",
};

export const dynamic = "force-dynamic";

type StaffAccount = Readonly<{
  id: string;
  email: string;
  status: AccountStatus;
  roles: AppRole[];
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
      .in("role", ["attendance_manager", "admin"]),
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
  const rolesByUserId = new Map<string, AppRole[]>();

  for (const record of rolesResult.data ?? []) {
    const existing = rolesByUserId.get(record.user_id) ?? [];
    existing.push(record.role as AppRole);
    rolesByUserId.set(record.user_id, existing);
  }

  return usersResult.data.users
    .flatMap((user) => {
      const roles = rolesByUserId.get(user.id);
      const status = accountsById.get(user.id);

      if (!user.email || !roles || !status) return [];

      return [
        {
          id: user.id,
          email: user.email,
          status: status as AccountStatus,
          roles: roles.sort(),
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
            <p className="eyebrow">Administration</p>
            <h1>Manage staff access</h1>
            <p className="muted">
              Create single-use password setup links for approved staff accounts.
              Links expire after one hour, and a replacement revokes the previous
              link.
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

        <div className="notice" role="status">
          Share setup links directly with the intended staff member. Do not place
          them in tickets, pull requests, screenshots, or shared channels.
        </div>

        <div className="table-wrap">
          <table className="content-table">
            <thead>
              <tr>
                <th>Staff account</th>
                <th>Role</th>
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
                  <td>{account.roles.join(", ")}</td>
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
