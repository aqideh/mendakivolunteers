"use client";

import { useMemo, useState } from "react";

import { StaffRoleEditor } from "@/app/admin/staff/staff-role-editor";
import { StaffSetupLinkForm } from "@/app/admin/staff/staff-setup-link-form";
import {
  filterStaffDirectory,
  type StaffDirectoryAccount,
  type StaffDirectorySort,
  type StaffSignInFilter,
} from "@/lib/auth/staff-directory";
import {
  staffInviteRoleOptions,
  type StaffInviteRole,
} from "@/lib/auth/staff-roles";
import { formatSingaporeDateTime } from "@/lib/content/dates";

export function StaffDirectoryTable({
  accounts,
}: Readonly<{ accounts: readonly StaffDirectoryAccount[] }>) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<StaffInviteRole | "all">("all");
  const [signIn, setSignIn] = useState<StaffSignInFilter>("all");
  const [sort, setSort] = useState<StaffDirectorySort>("name-asc");
  const filteredAccounts = useMemo(
    () => filterStaffDirectory(accounts, { query, role, signIn, sort }),
    [accounts, query, role, signIn, sort],
  );

  return (
    <section className="staff-directory" aria-labelledby="staff-directory-heading">
      <div className="staff-directory-heading">
        <div>
          <h2 id="staff-directory-heading">Staff directory</h2>
          <p className="muted">Manage KELUARGA access levels and setup for staff accounts.</p>
        </div>
        <span className="staff-directory-count" aria-live="polite">
          {filteredAccounts.length} of {accounts.length} accounts
        </span>
      </div>

      <div className="staff-directory-toolbar">
        <div className="staff-directory-field">
          <label htmlFor="staff-directory-search">Search by name or email</label>
          <input
            id="staff-directory-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search staff..."
          />
        </div>
        <div className="staff-directory-field">
          <label htmlFor="staff-directory-role">Access level</label>
          <select
            id="staff-directory-role"
            value={role}
            onChange={(event) => setRole(event.target.value as StaffInviteRole | "all")}
          >
            <option value="all">All access levels</option>
            {staffInviteRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="staff-directory-field">
          <label htmlFor="staff-directory-activity">Last sign-in</label>
          <select
            id="staff-directory-activity"
            value={signIn}
            onChange={(event) => setSignIn(event.target.value as StaffSignInFilter)}
          >
            <option value="all">Any time</option>
            <option value="recent">Within 30 days</option>
            <option value="older">Over 30 days ago</option>
            <option value="never">Never signed in</option>
          </select>
        </div>
        <div className="staff-directory-field">
          <label htmlFor="staff-directory-sort">Sort by</label>
          <select
            id="staff-directory-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as StaffDirectorySort)}
          >
            <option value="name-asc">Name · A–Z</option>
            <option value="name-desc">Name · Z–A</option>
            <option value="recent">Last sign-in · newest</option>
            <option value="oldest">Last sign-in · oldest</option>
            <option value="role-desc">Access level · highest</option>
            <option value="role-asc">Access level · lowest</option>
          </select>
        </div>
      </div>

      <div className="table-wrap staff-directory-table-wrap">
        <table className="content-table staff-directory-table">
          <thead>
            <tr>
              <th scope="col">Staff member</th>
              <th scope="col">Access level</th>
              <th scope="col">Status</th>
              <th scope="col">Last sign-in</th>
              <th scope="col">Setup</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.map((account) => (
              <tr key={account.id}>
                <td>
                  <div className="staff-directory-identity">
                    <strong>{account.name || account.email}</strong>
                    {account.name ? <span>{account.email}</span> : <span>Name not provided</span>}
                  </div>
                </td>
                <td>
                  <StaffRoleEditor
                    email={account.email}
                    role={account.role}
                    userId={account.id}
                  />
                </td>
                <td>
                  <span className="status-pill">{account.status.replaceAll("_", " ")}</span>
                </td>
                <td className="staff-directory-date">
                  {account.lastSignInAt
                    ? formatSingaporeDateTime(account.lastSignInAt)
                    : "Never"}
                </td>
                <td>
                  <details className="staff-directory-setup">
                    <summary>Setup options</summary>
                    <div className="staff-directory-setup-body">
                      <StaffSetupLinkForm userId={account.id} />
                    </div>
                  </details>
                </td>
              </tr>
            ))}
            {filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  {accounts.length
                    ? "No staff accounts match these filters."
                    : "No staff accounts were found."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
