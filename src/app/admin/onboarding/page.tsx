import type { Metadata } from "next";
import Link from "next/link";

import { PendingButton } from "@/app/admin/onboarding/pending-button";
import { sendVolunteerOnboardingInvite } from "@/app/admin/onboarding/actions";
import { requireAdmin } from "@/lib/auth/staff-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

import styles from "./onboarding.module.css";

export const metadata: Metadata = { title: "Volunteer onboarding" };
export const dynamic = "force-dynamic";

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

type VolunteerRow = Readonly<{
  id: string;
  volunteer_code: string;
  display_name: string | null;
  primary_email_normalized: string | null;
  mobile: string | null;
  auth_user_id: string | null;
  official_hours_24_months: number | string | null;
}>;

type InviteRow = Readonly<{
  id: string;
  volunteer_id: string;
  auth_user_id: string | null;
  email_normalized: string;
  status: string;
  invited_at: string;
  last_sent_at: string | null;
  accepted_at: string | null;
  send_count: number;
  last_error: string | null;
}>;

type StatusKey =
  | "not_invited"
  | "sent"
  | "onboarding"
  | "active"
  | "attention";

function one(
  values: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function digits(value: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function statusFor(
  volunteer: VolunteerRow,
  onboardingCompletedAt: string | null | undefined,
  invite: InviteRow | undefined,
): StatusKey {
  if (volunteer.auth_user_id && onboardingCompletedAt) return "active";
  if (volunteer.auth_user_id) return "onboarding";
  if (invite?.status === "sent" || invite?.status === "pending") return "sent";
  if (invite?.status === "failed") return "attention";
  return "not_invited";
}

function statusLabel(status: StatusKey) {
  if (status === "not_invited") return "Not invited";
  if (status === "sent") return "Invite sent";
  if (status === "onboarding") return "Onboarding";
  if (status === "active") return "Active";
  return "Needs attention";
}

function messageFor(code: string | undefined, volunteerCode: string | undefined) {
  const person = volunteerCode ? ` ${volunteerCode}` : "";
  switch (code) {
    case "invalid":
      return "Choose a valid volunteer and email address.";
    case "work_email":
      return "MENDAKI work email addresses are reserved for staff accounts. Use the volunteer's personal email.";
    case "volunteer_missing":
      return "That volunteer record could not be found.";
    case "profile_check":
    case "auth_lookup":
      return "Keluarga could not check the volunteer account. Try again.";
    case "already_active":
      return `${person.trim() || "This volunteer"} is already fully onboarded.`;
    case "linked_email_mismatch":
      return "This volunteer is already linked to an auth account with a different email. Review the account before resending.";
    case "identity_conflict":
      return "That email is already linked or actively invited to a different KEL identity. Use Reconciliation instead of overriding it.";
    case "staff_account":
      return "That email belongs to a staff-access account and cannot be linked as a volunteer identity.";
    case "account_create":
      return "The volunteer auth account could not be prepared.";
    case "invite_record":
      return "The onboarding invitation could not be created or updated.";
    case "email_send":
      return "The onboarding invitation was prepared, but the auth email could not be sent. Check email delivery and try again.";
    case "invite_save":
      return "The email was sent, but Keluarga could not update the invitation status. Check the invitation history before resending.";
    default:
      return "The onboarding action could not be completed.";
  }
}

export default async function VolunteerOnboardingPage({ searchParams }: PageProps) {
  await requireAdmin("/admin/onboarding");
  const params = await searchParams;
  const query = one(params, "q")?.trim() ?? "";
  const requestedStatus = one(params, "status") ?? "all";
  const success = one(params, "success");
  const error = one(params, "error");
  const volunteerCode = one(params, "volunteer");

  const admin = getPhaseOneAdminClient();
  const [volunteersResult, profilesResult, invitesResult] = await Promise.all([
    admin
      .schema("core")
      .from("volunteers")
      .select(
        "id, volunteer_code, display_name, primary_email_normalized, mobile, auth_user_id, official_hours_24_months",
      )
      .order("volunteer_code", { ascending: true })
      .limit(5000),
    admin
      .from("keluarga_volunteer_profiles")
      .select("volunteer_id, onboarding_completed_at")
      .limit(5000),
    admin
      .schema("core")
      .from("volunteer_onboarding_invites")
      .select(
        "id, volunteer_id, auth_user_id, email_normalized, status, invited_at, last_sent_at, accepted_at, send_count, last_error",
      )
      .order("invited_at", { ascending: false })
      .limit(2000),
  ]);

  if (volunteersResult.error || profilesResult.error || invitesResult.error) {
    throw new Error("Volunteer onboarding console could not be loaded");
  }

  const volunteers = (volunteersResult.data ?? []) as VolunteerRow[];
  const invites = (invitesResult.data ?? []) as InviteRow[];
  const profileByVolunteer = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.volunteer_id,
      profile.onboarding_completed_at as string | null,
    ]),
  );

  const latestInviteByVolunteer = new Map<string, InviteRow>();
  for (const invite of invites) {
    if (!latestInviteByVolunteer.has(invite.volunteer_id)) {
      latestInviteByVolunteer.set(invite.volunteer_id, invite);
    }
  }

  const linkedUserIds = Array.from(
    new Set(
      volunteers
        .map((volunteer) => volunteer.auth_user_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const authUsers = await Promise.all(
    linkedUserIds.map(async (userId) => {
      const result = await admin.auth.admin.getUserById(userId);
      return [
        userId,
        result.error ? null : result.data.user.email?.trim().toLowerCase() ?? null,
      ] as const;
    }),
  );
  const authEmailByUser = new Map(authUsers);

  const rows = volunteers.map((volunteer) => {
    const invite = latestInviteByVolunteer.get(volunteer.id);
    const status = statusFor(
      volunteer,
      profileByVolunteer.get(volunteer.id),
      invite,
    );
    const accountEmail = volunteer.auth_user_id
      ? authEmailByUser.get(volunteer.auth_user_id) ?? null
      : null;
    const inviteEmail =
      invite && ["pending", "sent"].includes(invite.status)
        ? invite.email_normalized
        : null;

    return {
      volunteer,
      invite,
      status,
      email:
        accountEmail ??
        inviteEmail ??
        volunteer.primary_email_normalized ??
        "",
    };
  });

  const counts = rows.reduce(
    (result, row) => {
      result[row.status] += 1;
      return result;
    },
    {
      not_invited: 0,
      sent: 0,
      onboarding: 0,
      active: 0,
      attention: 0,
    } satisfies Record<StatusKey, number>,
  );

  const normalizedQuery = query.toLowerCase();
  const normalizedDigits = digits(query);
  const filtered = rows
    .filter((row) => {
      if (
        requestedStatus !== "all" &&
        requestedStatus !== row.status
      ) {
        return false;
      }

      if (!normalizedQuery) return true;

      const volunteer = row.volunteer;
      const textMatch = [
        volunteer.volunteer_code,
        volunteer.display_name ?? "",
        volunteer.primary_email_normalized ?? "",
        row.email,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));

      const mobileMatch =
        Boolean(normalizedDigits) &&
        digits(volunteer.mobile).includes(normalizedDigits);

      return textMatch || mobileMatch;
    })
    .sort((left, right) => {
      const priority: Record<StatusKey, number> = {
        attention: 0,
        sent: 1,
        onboarding: 2,
        not_invited: 3,
        active: 4,
      };
      return (
        priority[left.status] - priority[right.status] ||
        left.volunteer.volunteer_code.localeCompare(
          right.volunteer.volunteer_code,
        )
      );
    });

  const visible = filtered.slice(0, 60);
  const volunteerById = new Map(
    volunteers.map((volunteer) => [volunteer.id, volunteer]),
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Volunteer accounts</p>
          <h1>Volunteer onboarding</h1>
          <p>
            Select the canonical KEL identity first, then send a secure auth email.
            The verified account will attach to that volunteer and keep their
            existing history.
          </p>
        </div>
        <Link className={styles.secondaryLink} href="/admin/reconciliation">
          Open Reconciliation
        </Link>
      </header>

      {success === "sent" ? (
        <div className="notice notice-success" role="status">
          Onboarding email sent{volunteerCode ? ` for ${volunteerCode}` : ""}.
        </div>
      ) : null}
      {error ? (
        <div className="notice notice-error" role="alert">
          {messageFor(error, volunteerCode)}
        </div>
      ) : null}

      <section className={styles.summaryGrid} aria-label="Onboarding status">
        <div><strong>{counts.not_invited}</strong><span>Not invited</span></div>
        <div><strong>{counts.sent}</strong><span>Invite sent</span></div>
        <div><strong>{counts.onboarding}</strong><span>Onboarding</span></div>
        <div><strong>{counts.active}</strong><span>Active</span></div>
        <div><strong>{counts.attention}</strong><span>Needs attention</span></div>
      </section>

      <section className={styles.console}>
        <div className={styles.consoleHeader}>
          <div>
            <h2>Find an existing volunteer</h2>
            <p>Search by name, KEL ID, email or mobile number.</p>
          </div>
          <span>{filtered.length} matching</span>
        </div>

        <form className={styles.filters} method="get">
          <input
            aria-label="Search volunteers"
            name="q"
            defaultValue={query}
            placeholder="Search name, KEL ID, email or mobile"
          />
          <select aria-label="Filter onboarding status" name="status" defaultValue={requestedStatus}>
            <option value="all">All statuses</option>
            <option value="not_invited">Not invited</option>
            <option value="sent">Invite sent</option>
            <option value="onboarding">Onboarding</option>
            <option value="active">Active</option>
            <option value="attention">Needs attention</option>
          </select>
          <button className="button button-secondary" type="submit">
            Search
          </button>
          {query || requestedStatus !== "all" ? (
            <Link className={styles.clearLink} href="/admin/onboarding">
              Clear
            </Link>
          ) : null}
        </form>

        <div className={styles.resultList}>
          {visible.map(({ volunteer, invite, status, email }) => {
            const resend =
              status === "sent" || status === "onboarding" || status === "attention";
            const active = status === "active";
            const hours = Number(volunteer.official_hours_24_months ?? 0);

            return (
              <article className={styles.resultCard} key={volunteer.id}>
                <div className={styles.identity}>
                  <div>
                    <div className={styles.identityTitle}>
                      <strong>{volunteer.display_name ?? "Unnamed volunteer"}</strong>
                      <span>{volunteer.volunteer_code}</span>
                    </div>
                    <p>
                      {volunteer.mobile ?? "No mobile"} · {hours.toFixed(1)}h in
                      recorded 24-month history
                    </p>
                  </div>
                  <span className={styles.status} data-status={status}>
                    {statusLabel(status)}
                  </span>
                </div>

                <div className={styles.details}>
                  <div>
                    <span>Database email</span>
                    <strong>{volunteer.primary_email_normalized ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Last invitation</span>
                    <strong>
                      {invite?.last_sent_at
                        ? formatSingaporeDateTime(invite.last_sent_at)
                        : "Never"}
                    </strong>
                  </div>
                  <div>
                    <span>Sends</span>
                    <strong>{invite?.send_count ?? 0}</strong>
                  </div>
                </div>

                {active ? (
                  <div className={styles.activeNote}>
                    Account active. No onboarding email is needed.
                  </div>
                ) : (
                  <form action={sendVolunteerOnboardingInvite} className={styles.inviteForm}>
                    <input type="hidden" name="volunteerId" value={volunteer.id} />
                    <input type="hidden" name="volunteerCode" value={volunteer.volunteer_code} />
                    <input type="hidden" name="returnQuery" value={query} />
                    <input type="hidden" name="returnStatus" value={requestedStatus} />

                    <label>
                      <span>Onboarding email</span>
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        defaultValue={email}
                        readOnly={Boolean(volunteer.auth_user_id)}
                        required
                      />
                    </label>
                    <PendingButton
                      label={resend ? "Resend onboarding email" : "Send onboarding email"}
                    />
                  </form>
                )}

                {status === "attention" && invite?.last_error ? (
                  <p className={styles.errorDetail}>
                    Last attempt: {invite.last_error.replaceAll("_", " ")}
                  </p>
                ) : null}
              </article>
            );
          })}
          {visible.length === 0 ? (
            <div className={styles.emptyState}>
              No volunteers match this search and status filter.
            </div>
          ) : null}
          {filtered.length > visible.length ? (
            <p className={styles.resultLimit}>
              Showing the first {visible.length} matches. Narrow the search to find
              a specific volunteer.
            </p>
          ) : null}
        </div>
      </section>

      <section className={styles.history}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Invitation history</h2>
            <p>Recent admin-issued onboarding emails and outcomes.</p>
          </div>
        </div>

        <div className={styles.historyTable}>
          {invites.slice(0, 20).map((invite) => {
            const volunteer = volunteerById.get(invite.volunteer_id);
            return (
              <div className={styles.historyRow} key={invite.id}>
                <div>
                  <strong>
                    {volunteer?.display_name ?? "Volunteer"} ·{" "}
                    {volunteer?.volunteer_code ?? "Unknown KEL"}
                  </strong>
                  <span>{invite.email_normalized}</span>
                </div>
                <span>{invite.send_count} send{invite.send_count === 1 ? "" : "s"}</span>
                <span>{statusLabel(
                  invite.status === "failed"
                    ? "attention"
                    : invite.status === "accepted"
                      ? "active"
                      : invite.status === "sent" || invite.status === "pending"
                        ? "sent"
                        : "not_invited",
                )}</span>
                <span>{formatSingaporeDateTime(invite.invited_at)}</span>
              </div>
            );
          })}
          {invites.length === 0 ? (
            <div className={styles.emptyState}>No onboarding invitations yet.</div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
