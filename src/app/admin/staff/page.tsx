import type { Metadata } from "next";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";

import { StaffDirectoryTable } from "@/app/admin/staff/staff-directory-table";
import { StaffInviteForm } from "@/app/admin/staff/staff-invite-form";
import { requireAdmin } from "@/lib/auth/staff-access";
import type { StaffDirectoryAccount } from "@/lib/auth/staff-directory";
import {
  staffInviteRoleOptions,
  staffInviteRoleValues,
  type StaffInviteRole,
} from "@/lib/auth/staff-roles";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import type { AccountStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "Manage staff access",
};

export const dynamic = "force-dynamic";

async function loadStaffAccounts(): Promise<StaffDirectoryAccount[]> {
  const admin = getPhaseOneAdminClient();
  const [accountsResult, rolesResult] = await Promise.all([
    admin
      .schema("core")
      .from("user_accounts")
      .select("id, status, display_name"),
    admin
      .schema("core")
      .from("user_roles")
      .select("user_id, role")
      .in("role", [...staffInviteRoleValues]),
  ]);

  if (accountsResult.error || rolesResult.error) {
    console.error("Unable to load staff access records", {
      accountCode: accountsResult.error?.code,
      roleCode: rolesResult.error?.code,
    });
    throw new Error("Staff access records could not be loaded");
  }

  const accountsById = new Map(
    (accountsResult.data ?? []).map((account) => [account.id, account]),
  );
  const roleByUserId = new Map<string, StaffInviteRole>();
  for (const record of rolesResult.data ?? []) {
    roleByUserId.set(record.user_id, record.role as StaffInviteRole);
  }

  const staffUsers: User[] = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("Unable to load staff sign-in records", {
        code: error.code,
        status: error.status,
      });
      throw new Error("Staff access records could not be loaded");
    }
    staffUsers.push(...data.users.filter((user) => roleByUserId.has(user.id)));
    if (data.users.length < perPage) break;
  }

  return staffUsers.flatMap((user) => {
    const role = roleByUserId.get(user.id);
    const account = accountsById.get(user.id);
    if (!user.email || !role || !account) return [];

    const candidateName =
      account.display_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name;
    const name = typeof candidateName === "string" ? candidateName.trim() || null : null;

    return [{
      id: user.id,
      name,
      email: user.email,
      status: account.status as AccountStatus,
      role,
      lastSignInAt: user.last_sign_in_at ?? null,
    }];
  });
}

export default async function StaffAccessPage() {
  await requireAdmin();
  const staffAccounts = await loadStaffAccounts();

  return (
    <div className="admin-page site-shell staff-access-page">
      <div className="admin-page-frame page-frame">
        <div className="dashboard-header">
          <div>
            <h1>Manage staff access</h1>
            <p className="muted">
              Review and manage KELUARGA staff accounts. MakLom permissions are managed separately.
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

        <StaffDirectoryTable accounts={staffAccounts} />

        <div className="staff-access-secondary">
          <details className="staff-access-disclosure">
            <summary>Invite a staff member</summary>
            <div className="staff-access-disclosure-body">
              <StaffInviteForm />
              <p className="muted">
                Staff invitations and recovery links are Admin-only. Staff set a
                password using the emailed setup link, then sign in with their
                work email and password.
              </p>
            </div>
          </details>

          <details className="staff-access-disclosure">
            <summary>KELUARGA roles &amp; permissions</summary>
            <div className="staff-access-disclosure-body">
              <p className="muted">
                Access levels replace the previous level rather than stacking.
                KELUARGA Admin can manage KELUARGA staff access; MakLom access
                is assigned independently.
              </p>
              <dl className="data-list">
                {staffInviteRoleOptions.map((option) => (
                  <div className="data-row" key={option.value}>
                    <dt>{option.label}</dt>
                    <dd>{option.description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
