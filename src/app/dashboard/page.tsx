import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/dashboard/actions";
import { KeluargaRegistrationSummary } from "@/components/keluarga-registration-summary";
import { PortalHeader } from "@/components/portal-header";
import { ProfileEditor } from "@/components/profile-editor";
import { ProfilePhotoUploader } from "@/components/profile-photo-uploader";
import { ProfilePassportTabs } from "@/components/profile-passport-tabs";
import { VolunteerJourneySummary } from "@/components/volunteer-journey-summary";
import { hasContentManagerRole } from "@/lib/auth/content-access";
import { hasGamificationManagerRole } from "@/lib/auth/gamification-access";
import { hasPathwayManagerRole } from "@/lib/auth/pathway-access";
import { createClient } from "@/lib/supabase/server";
import type { AccountStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "My Profile",
};

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ProfileTab = "overview" | "activity" | "recognition";

type KeluargaVolunteerProfile = {
  volunteer_id: string;
  avatar_path: string | null;
  bio: string | null;
  interests: string[];
  skills: string[];
  availability_notes: string | null;
};

type PointsSnapshot = {
  balance?: number | string;
};

type BadgeSnapshot = {
  badges?: Array<{ award_id: string }>;
};

const dashboardErrors: Record<string, string> = {
  cms_access_denied: "Your account does not have permission to manage content.",
  cms_authorization_unavailable:
    "Content-management permissions could not be checked. No content was changed.",
  pathway_access_denied:
    "Your account does not have permission to manage volunteer pathways.",
  pathway_authorization_unavailable:
    "Pathway-management permissions could not be checked. No pathway data was changed.",
  gamification_access_denied:
    "Your account does not have permission to manage volunteer points.",
  gamification_authorization_unavailable:
    "Points-management permissions could not be checked. No point data was changed.",
  profile_validation:
    "Check your profile details. Interests and skills should be comma-separated and each entry must be 60 characters or fewer.",
  profile_update_failed:
    "Your profile could not be updated. No profile data was changed.",
  registration_withdraw_invalid:
    "The registration could not be identified.",
  registration_withdraw_started:
    "Attendance has already started for this registration. Contact Volunteer Management if a correction is needed.",
  registration_withdraw_failed:
    "The registration could not be withdrawn. No registration data was changed.",
};

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
      return "Profile setup";
    case "active":
      return "Active";
    case "suspended":
      return "Suspended";
    case "closed":
      return "Closed";
  }
}

function profileTab(value: string | undefined): ProfileTab {
  if (value === "activity" || value === "recognition") {
    return value;
  }
  return "overview";
}

function profileCompletion(input: {
  avatarPath: string | null;
  displayName: string;
  mobile: string | null;
  bio: string | null;
  interests: string[];
  skills: string[];
  availabilityNotes: string | null;
}) {
  const checks = [
    Boolean(input.avatarPath),
    Boolean(input.displayName.trim()),
    Boolean(input.mobile?.trim()),
    Boolean(input.bio?.trim()),
    input.interests.length > 0,
    input.skills.length > 0,
    Boolean(input.availabilityNotes?.trim()),
  ];
  return Math.round(
    (checks.filter(Boolean).length / checks.length) * 100,
  );
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

  const accountClient = supabase as unknown as SupabaseClient;
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
      .select("id, volunteer_code, display_name, mobile")
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

  let presentationProfile: KeluargaVolunteerProfile | null = null;
  let approvedContributions: Array<{
    id: string;
    approved_minutes: number;
    occurred_at: string;
  }> = [];
  let pointsBalance = 0;
  let badgeCount = 0;

  if (volunteer) {
    const [profileResult, contributionResult, pointsResult, badgesResult] =
      await Promise.all([
        accountClient
          .from("keluarga_volunteer_profiles")
          .select(
            "volunteer_id, avatar_path, bio, interests, skills, availability_notes",
          )
          .eq("volunteer_id", volunteer.id)
          .maybeSingle(),
        accountClient
          .from("volunteer_contributions")
          .select("id, approved_minutes, occurred_at")
          .eq("volunteer_id", volunteer.id)
          .eq("status", "approved")
          .order("occurred_at", { ascending: false }),
        accountClient.schema("core").rpc("get_current_points_snapshot"),
        accountClient.schema("core").rpc("get_current_badges_snapshot"),
      ]);

    if (
      profileResult.error ||
      contributionResult.error ||
      pointsResult.error ||
      badgesResult.error
    ) {
      console.error("Unable to load volunteer profile passport", {
        profileCode: profileResult.error?.code,
        contributionCode: contributionResult.error?.code,
        pointsCode: pointsResult.error?.code,
        badgesCode: badgesResult.error?.code,
      });
      throw new Error("Volunteer profile passport could not be loaded");
    }

    presentationProfile =
      (profileResult.data as KeluargaVolunteerProfile | null) ?? null;
    approvedContributions =
      (contributionResult.data as Array<{
        id: string;
        approved_minutes: number;
        occurred_at: string;
      }> | null) ?? [];

    const points = pointsResult.data as PointsSnapshot | null;
    const badges = badgesResult.data as BadgeSnapshot | null;
    pointsBalance = Number(points?.balance ?? 0);
    badgeCount = badges?.badges?.length ?? 0;
  }

  const parameters = await searchParams;
  const activeTab = profileTab(readParameter(parameters, "tab"));
  const errorCode = readParameter(parameters, "error");
  const successCode = readParameter(parameters, "success");
  const profileMode = readParameter(parameters, "profile");
  const errorMessage = errorCode ? dashboardErrors[errorCode] : undefined;

  const displayName =
    volunteer?.display_name?.trim() || account.display_name?.trim() || "Volunteer";
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const interests = presentationProfile?.interests ?? [];
  const skills = presentationProfile?.skills ?? [];
  const bio = presentationProfile?.bio ?? null;
  const availabilityNotes = presentationProfile?.availability_notes ?? null;
  const avatarPath = presentationProfile?.avatar_path ?? null;
  const approvedMinutes = approvedContributions.reduce(
    (total, contribution) =>
      total + Number(contribution.approved_minutes ?? 0),
    0,
  );
  const approvedHours = approvedMinutes / 60;
  const completion = profileCompletion({
    avatarPath,
    displayName,
    mobile: volunteer?.mobile ?? null,
    bio,
    interests,
    skills,
    availabilityNotes,
  });

  let avatarUrl: string | null = null;
  if (avatarPath) {
    const signedUrlResult = await accountClient.storage
      .from("volunteer-profile-photos")
      .createSignedUrl(avatarPath, 60 * 60);

    if (signedUrlResult.error) {
      console.error("Unable to create profile photo URL", {
        message: signedUrlResult.error.message,
      });
      throw new Error("Profile photo could not be loaded");
    }
    avatarUrl = signedUrlResult.data.signedUrl;
  }

  const isAdmin = roles.includes("admin");
  const canManageContent = hasContentManagerRole(roles);
  const canManageGamification = hasGamificationManagerRole(roles);
  const canManagePathways = hasPathwayManagerRole(roles);
  const isStaffUser =
    isAdmin ||
    canManageContent ||
    canManageGamification ||
    canManagePathways ||
    roles.includes("staff") ||
    roles.includes("volteam") ||
    roles.includes("volunteer_leader");

  return (
    <div className="site-shell profile-passport-shell">
      <PortalHeader status="My Profile" dashboard />

      <main className="page-frame profile-passport-page">
        {errorMessage ? (
          <div className="notice notice-error profile-passport-notice" role="alert">
            {errorMessage}
          </div>
        ) : null}
        {successCode === "profile_updated" ? (
          <div className="notice notice-success profile-passport-notice" role="status">
            Your profile has been updated.
          </div>
        ) : null}
        {successCode === "registration_withdrawn" ? (
          <div className="notice notice-success profile-passport-notice" role="status">
            Your programme registration has been withdrawn.
          </div>
        ) : null}

        <section className="profile-passport-hero" aria-labelledby="profile-passport-title">
          <div className="profile-passport-hero-topline">
            {volunteer ? (
              <ProfilePhotoUploader
                volunteerId={volunteer.id}
                userId={userId}
                displayName={displayName}
                avatarUrl={avatarUrl}
                avatarPath={avatarPath}
                completion={completion}
              />
            ) : (
              <div className="profile-passport-avatar profile-passport-avatar-static" aria-hidden="true">
                {firstName.slice(0, 1).toUpperCase()}
              </div>
            )}

            <Link
              className="profile-passport-settings"
              href="/dashboard?profile=edit"
              aria-label="Edit profile"
              title="Edit profile"
            >
              <span aria-hidden="true">⚙</span>
            </Link>
          </div>

          <div className="profile-passport-copy">
            <h1 id="profile-passport-title">Hi, {firstName}</h1>
            <p className="profile-passport-meta">
              {volunteer?.volunteer_code ? (
                <strong>{volunteer.volunteer_code}</strong>
              ) : (
                <strong>{accountStatusLabel(account.status)}</strong>
              )}
              <span aria-hidden="true"> · </span>
              <span>Volunteer since {new Date(account.created_at).getFullYear()}</span>
            </p>

            {bio ? (
              <p className="profile-passport-bio">{bio}</p>
            ) : (
              <p className="profile-passport-bio profile-passport-bio-empty">
                Add a short introduction, your interests and skills to make this profile
                feel like yours.
              </p>
            )}

            {interests.length > 0 ? (
              <div className="profile-passport-tags" aria-label="Volunteering interests">
                {interests.slice(0, 5).map((interest) => (
                  <span key={interest}>{interest}</span>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {profileMode === "edit" && volunteer ? (
          <section className="profile-passport-edit-panel" aria-labelledby="profile-edit-title">
            <div className="profile-passport-section-heading">
              <div>
                <h2 id="profile-edit-title">Edit profile</h2>
                <p>
                  This is your volunteer-facing KELUARGA profile. Longitudinal Volunteer
                  Management records remain managed separately in MakLom.
                </p>
              </div>
              <Link className="text-link" href="/dashboard">
                Close
              </Link>
            </div>
            <ProfileEditor
              displayName={displayName}
              mobile={volunteer.mobile}
              bio={bio}
              interests={interests}
              skills={skills}
              availabilityNotes={availabilityNotes}
            />
            <div className="profile-passport-account-row">
              <span>{authUser.email ?? "Email unavailable"}</span>
              <form action={signOut}>
                <button className="text-link button-reset" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </section>
        ) : null}

        <ProfilePassportTabs initialTab={activeTab} />

        <div
          id="profile-passport-panel-overview"
          className="profile-passport-tab-panel profile-passport-tab-transition"
          data-profile-passport-panel="overview"
          data-active={activeTab === "overview" ? "true" : "false"}
          hidden={activeTab !== "overview"}
        >
            <section aria-labelledby="impact-title">
              <div className="profile-passport-section-heading">
                <div>
                  <h2 id="impact-title">Your impact</h2>
                  <p>A quick view of your contribution across KELUARGA.</p>
                </div>
              </div>

              <div className="profile-passport-metrics">
                <article>
                  <strong>{approvedHours.toFixed(1)}</strong>
                  <span>Approved hours</span>
                </article>
                <article>
                  <strong>{approvedContributions.length}</strong>
                  <span>Activities credited</span>
                </article>
                <article>
                  <strong>{pointsBalance}</strong>
                  <span>Points</span>
                </article>
                <article>
                  <strong>{badgeCount}</strong>
                  <span>Badges</span>
                </article>
              </div>
            </section>

            <section className="profile-passport-story" aria-labelledby="profile-story-title">
              <div className="profile-passport-section-heading">
                <div>
                  <h2 id="profile-story-title">Your volunteer profile</h2>
                  <p>Interests and strengths you have chosen to share in KELUARGA.</p>
                </div>
                <Link className="text-link" href="/dashboard?profile=edit">
                  Edit
                </Link>
              </div>

              <div className="profile-passport-story-grid">
                <div>
                  <h3>Interests</h3>
                  {interests.length ? (
                    <div className="profile-passport-tags">
                      {interests.map((interest) => (
                        <span key={interest}>{interest}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No interests added yet.</p>
                  )}
                </div>

                <div>
                  <h3>Skills</h3>
                  {skills.length ? (
                    <div className="profile-passport-tags">
                      {skills.map((skill) => (
                        <span key={skill}>{skill}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No skills added yet.</p>
                  )}
                </div>

                <div className="profile-passport-story-wide">
                  <h3>Availability</h3>
                  <p className={availabilityNotes ? undefined : "muted"}>
                    {availabilityNotes ?? "No availability notes added yet."}
                  </p>
                </div>
              </div>
            </section>

            <section aria-labelledby="profile-quick-links-title">
              <div className="profile-passport-section-heading">
                <div>
                  <h2 id="profile-quick-links-title">Continue your journey</h2>
                </div>
              </div>
              <div className="profile-passport-action-list">
                <Link href="/journey">
                  <span>
                    <strong>Event Guides</strong>
                    <small>Reporting times, briefings and event-day details</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link href="/opportunities">
                  <span>
                    <strong>Volunteer opportunities</strong>
                    <small>Find your next way to contribute</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link href="/pathways">
                  <span>
                    <strong>Volunteer pathways</strong>
                    <small>Explore how your role can grow over time</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </section>
          </div>

        <div
          id="profile-passport-panel-activity"
          className="profile-passport-tab-panel profile-passport-tab-transition"
          data-profile-passport-panel="activity"
          data-active={activeTab === "activity" ? "true" : "false"}
          hidden={activeTab !== "activity"}
        >
            <section aria-labelledby="activity-summary-title">
              <div className="profile-passport-section-heading">
                <div>
                  <h2 id="activity-summary-title">Activity summary</h2>
                  <p>Approved contributions and your programme registrations.</p>
                </div>
              </div>
              <div className="profile-passport-metrics profile-passport-metrics-compact">
                <article>
                  <strong>{approvedHours.toFixed(1)}</strong>
                  <span>Approved hours</span>
                </article>
                <article>
                  <strong>{approvedContributions.length}</strong>
                  <span>Credited activities</span>
                </article>
              </div>
            </section>

            {volunteer ? (
              <KeluargaRegistrationSummary volunteerId={volunteer.id} />
            ) : (
              <section className="notice" aria-labelledby="profile-setup-title">
                <h2 id="profile-setup-title">Volunteer profile setup incomplete</h2>
                <p>
                  Contact Volunteer Management so your account can be linked to a
                  KELUARGA volunteer profile.
                </p>
              </section>
            )}

            {approvedContributions.length > 0 ? (
              <section aria-labelledby="approved-contributions-title">
                <div className="profile-passport-section-heading">
                  <div>
                    <h2 id="approved-contributions-title">Approved contribution history</h2>
                    <p>
                      These records have completed Volunteer Management review in MakLom.
                    </p>
                  </div>
                </div>
                <div className="profile-passport-history">
                  {approvedContributions.map((contribution) => (
                    <article key={contribution.id}>
                      <div>
                        <strong>
                          {(Number(contribution.approved_minutes) / 60).toFixed(1)} hours
                        </strong>
                        <span>
                          {new Intl.DateTimeFormat("en-SG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            timeZone: "Asia/Singapore",
                          }).format(new Date(contribution.occurred_at))}
                        </span>
                      </div>
                      <span className="status-pill" data-state="verified">
                        Approved
                      </span>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

        <div
          id="profile-passport-panel-recognition"
          className="profile-passport-tab-panel profile-passport-recognition profile-passport-tab-transition"
          data-profile-passport-panel="recognition"
          data-active={activeTab === "recognition" ? "true" : "false"}
          hidden={activeTab !== "recognition"}
        >
            {volunteer ? <VolunteerJourneySummary /> : null}
            <section aria-labelledby="recognition-links-title">
              <div className="profile-passport-section-heading">
                <div>
                  <h2 id="recognition-links-title">Recognition and growth</h2>
                  <p>See the detail behind your points, badges and pathway position.</p>
                </div>
              </div>
              <div className="profile-passport-action-list">
                <Link href="/points">
                  <span>
                    <strong>Points history</strong>
                    <small>Review your audited recognition record</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link href="/pathways">
                  <span>
                    <strong>Pathway map</strong>
                    <small>See your current position and possible next steps</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </section>
          </div>

        {isStaffUser ? (
          <section className="profile-passport-management" aria-labelledby="staff-tools-title">
            <div className="profile-passport-section-heading">
              <div>
                <h2 id="staff-tools-title">Management access</h2>
                <p>Staff tools available to your account.</p>
              </div>
            </div>
            <div className="profile-passport-action-list">
              {isAdmin ? (
                <>
                  <Link href="/admin/staff">
                    <span>
                      <strong>Staff access</strong>
                      <small>Invite staff and manage KELUARGA permissions</small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </Link>
                  <a href="https://voldatabasetool.vercel.app/">
                    <span>
                      <strong>MakLom</strong>
                      <small>Open the Volunteer Management workspace</small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </a>
                </>
              ) : null}
              {(isAdmin || roles.includes("volteam") || roles.includes("staff") || roles.includes("volunteer_leader")) ? (
                <Link href="/admin/events">
                  <span>
                    <strong>Event Operations</strong>
                    <small>Rosters, attendance and event-day operations</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              ) : null}
              {canManageContent ? (
                <Link href="/admin/content">
                  <span>
                    <strong>Content management</strong>
                    <small>Manage opportunities and volunteer updates</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              ) : null}
              {canManageGamification ? (
                <Link href="/admin/points">
                  <span>
                    <strong>Points and badges</strong>
                    <small>Manage reviewed volunteer recognition</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              ) : null}
              {canManagePathways ? (
                <Link href="/admin/pathways">
                  <span>
                    <strong>Volunteer pathways</strong>
                    <small>Manage the pathway map and reviewed positions</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        {profileMode !== "edit" ? (
          <div className="profile-passport-footer-actions">
            <span>{authUser.email ?? "Email unavailable"}</span>
            <form action={signOut}>
              <button className="text-link button-reset" type="submit">
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </main>
    </div>
  );
}
