import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  assignVolunteerLeader,
  removeVolunteerLeader,
} from "@/app/admin/events/[id]/leaders/actions";
import { requireProgrammeManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import type { AccountStatus } from "@/types/database";

export const metadata: Metadata = { title: "Volunteer Leaders" };
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type LeaderAccount = {
  id: string;
  email: string;
  displayName: string | null;
  status: AccountStatus;
};

function parameter(values: Record<string, string | string[] | undefined>, key: string) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function EventVolunteerLeadersPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  await requireProgrammeManager(`/admin/events/${id}/leaders`);
  const admin = getPhaseOneAdminClient();

  const [eventResult, assignmentResult, leaderRolesResult] = await Promise.all([
    admin.from("phaseone_events").select("id, title").eq("id", id).maybeSingle(),
    admin
      .from("phaseone_event_volunteer_leaders")
      .select("user_id, assigned_at")
      .eq("event_id", id)
      .order("assigned_at", { ascending: true }),
    admin
      .schema("core")
      .from("user_roles")
      .select("user_id")
      .eq("role", "volunteer_leader"),
  ]);

  if (eventResult.error) {
    throw new Error("Event could not be loaded");
  }
  if (!eventResult.data) notFound();
  if (assignmentResult.error || leaderRolesResult.error) {
    throw new Error("Volunteer Leader assignments could not be loaded");
  }

  const leaderIds = Array.from(
    new Set((leaderRolesResult.data ?? []).map((item) => item.user_id)),
  );

  const accountsResult = leaderIds.length
    ? await admin
        .schema("core")
        .from("user_accounts")
        .select("id, display_name, status")
        .in("id", leaderIds)
    : { data: [], error: null };

  const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });

  if (accountsResult.error || usersResult.error) {
    throw new Error("Volunteer Leader accounts could not be loaded");
  }

  const authEmailById = new Map(
    usersResult.data.users.flatMap((user) =>
      user.email ? [[user.id, user.email] as const] : [],
    ),
  );

  const leaders: LeaderAccount[] = (accountsResult.data ?? [])
    .map((account) => ({
      id: account.id,
      email: authEmailById.get(account.id) ?? account.id,
      displayName: account.display_name,
      status: account.status as AccountStatus,
    }))
    .sort((left, right) => left.email.localeCompare(right.email));

  const assignmentByUserId = new Map(
    (assignmentResult.data ?? []).map((assignment) => [
      assignment.user_id,
      assignment.assigned_at,
    ]),
  );
  const assigned = leaders.filter((leader) => assignmentByUserId.has(leader.id));
  const available = leaders.filter(
    (leader) =>
      leader.status === "active" && !assignmentByUserId.has(leader.id),
  );

  const query = await searchParams;
  const success = parameter(query, "success");
  const error = parameter(query, "error");

  return (
    <div className="admin-page site-shell">
      <div className="admin-page-frame page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Event operations</p>
            <h1>{eventResult.data.title}</h1>
            <p className="muted">
              Volunteer Leaders can access attendance operations only for events
              explicitly assigned here.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href={`/admin/events/${id}/edit`}>
              Back to event
            </Link>
            <Link className="button button-primary" href={`/admin/events/${id}/attendance`}>
              Attendance
            </Link>
          </div>
        </div>

        {success ? <div className="notice notice-success" role="status">{success}</div> : null}
        {error ? <div className="notice notice-error" role="alert">{error}</div> : null}

        <section className="panel" aria-labelledby="assigned-leaders-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Event access</p>
              <h2 id="assigned-leaders-title">Assigned Volunteer Leaders</h2>
              <p className="muted">
                Assigned leaders can view this event roster, check volunteers in or
                out, mark attendance status, extend attendance to an adjacent shift,
                and display the event attendance QR.
              </p>
            </div>
            <span className="status-pill">{assigned.length} assigned</span>
          </div>

          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  <th>Volunteer Leader</th>
                  <th>Status</th>
                  <th>Assignment</th>
                </tr>
              </thead>
              <tbody>
                {assigned.map((leader) => (
                  <tr key={leader.id}>
                    <td>
                      <strong>{leader.displayName || leader.email}</strong>
                      {leader.displayName ? <span className="table-subtext">{leader.email}</span> : null}
                    </td>
                    <td><span className="status-pill">{leader.status}</span></td>
                    <td>
                      <form action={removeVolunteerLeader}>
                        <input name="eventId" type="hidden" value={id} />
                        <input name="userId" type="hidden" value={leader.id} />
                        <button className="button button-secondary" type="submit">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {assigned.length === 0 ? (
                  <tr><td colSpan={3}>No Volunteer Leaders are assigned to this event.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" aria-labelledby="assign-leader-title">
          <div className="section-header">
            <div>
              <h2 id="assign-leader-title">Assign a Volunteer Leader</h2>
              <p className="muted">
                Only active accounts whose KELUARGA access level is Volunteer Leader
                can be assigned.
              </p>
            </div>
          </div>

          {available.length > 0 ? (
            <form action={assignVolunteerLeader} className="inline-form">
              <input name="eventId" type="hidden" value={id} />
              <div className="form-field">
                <label htmlFor="volunteer-leader-user">Volunteer Leader</label>
                <select id="volunteer-leader-user" name="userId" required defaultValue="">
                  <option value="" disabled>Select a Volunteer Leader</option>
                  {available.map((leader) => (
                    <option key={leader.id} value={leader.id}>
                      {leader.displayName ? `${leader.displayName} · ${leader.email}` : leader.email}
                    </option>
                  ))}
                </select>
              </div>
              <button className="button button-primary" type="submit">Assign to event</button>
            </form>
          ) : (
            <div className="notice">
              No unassigned active Volunteer Leader accounts are available. An Admin
              must create or change staff access before another leader can be assigned.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
