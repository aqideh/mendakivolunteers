import { hasEventManagerRole } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";
import { getYmHubSyncOutcome, type YmHubSyncOutcome } from "@/lib/ymhub/read-model";
import type { AccountStatus, AppRole } from "@/types/database";

export type EventGuideViewer = Readonly<{
  userId: string;
  email: string | null;
  accountStatus: AccountStatus;
  roles: AppRole[];
  isStaffPreview: boolean;
  volunteerId: string | null;
  rosterEventIds: ReadonlySet<string>;
  registeredActivityIds: ReadonlySet<string>;
  registrationSyncOutcome: YmHubSyncOutcome | "not_linked";
  registrationsSyncedAt: string | null;
}>;

export type EventGuideViewerResult =
  | Readonly<{ state: "signed_out" }>
  | Readonly<{ state: "inactive" }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "authenticated"; viewer: EventGuideViewer }>;

export type EventGuideAuthorizationResult =
  | Readonly<{ state: "signed_out" }>
  | Readonly<{ state: "inactive" }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "not_found" }>
  | Readonly<{ state: "not_registered"; viewer: EventGuideViewer }>
  | Readonly<{
      state: "allowed";
      viewer: EventGuideViewer;
      event: {
        id: string;
        slug: string;
        is_published: boolean;
      };
    }>;

function normalizedEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email || null;
}

export async function getEventGuideViewer(): Promise<EventGuideViewerResult> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    return { state: "signed_out" };
  }

  const [userResult, accountResult, rolesResult, volunteerResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .schema("core")
      .from("user_accounts")
      .select("status")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .order("role"),
    supabase
      .schema("core")
      .from("volunteers")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle(),
  ]);

  if (
    userResult.error ||
    accountResult.error ||
    rolesResult.error ||
    volunteerResult.error ||
    !accountResult.data ||
    !rolesResult.data
  ) {
    console.error("Unable to load Event Guide viewer", {
      userCode: userResult.error?.code,
      accountCode: accountResult.error?.code,
      rolesCode: rolesResult.error?.code,
      volunteerCode: volunteerResult.error?.code,
      userId,
    });
    return { state: "unavailable" };
  }

  if (
    accountResult.data.status === "suspended" ||
    accountResult.data.status === "closed"
  ) {
    return { state: "inactive" };
  }

  const roles = rolesResult.data.map(({ role }) => role) as AppRole[];
  const isStaffPreview =
    accountResult.data.status === "active" && hasEventManagerRole(roles);
  const user = userResult.data.user;
  const emailVerified = Boolean(user?.email_confirmed_at ?? user?.confirmed_at);
  const email = emailVerified ? normalizedEmail(user?.email) : null;

  if (isStaffPreview) {
    return {
      state: "authenticated",
      viewer: {
        userId,
        email,
        accountStatus: accountResult.data.status,
        roles,
        isStaffPreview: true,
        volunteerId: volunteerResult.data?.id ?? null,
        rosterEventIds: new Set<string>(),
        registeredActivityIds: new Set<string>(),
        registrationSyncOutcome: volunteerResult.data ? "not_synced" : "not_linked",
        registrationsSyncedAt: null,
      },
    };
  }

  const admin = getPhaseOneAdminClient();
  const rosterPromise = email
    ? admin
        .from("phaseone_roster")
        .select("event_id")
        .eq("email_normalized", email)
        .limit(2000)
    : Promise.resolve({ data: [], error: null });
  const syncPromise = volunteerResult.data
    ? admin
        .schema("ymhub")
        .from("volunteer_sync_status")
        .select(
          "registrations_synced_at, last_successful_at, last_failed_at",
        )
        .eq("volunteer_id", volunteerResult.data.id)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const registrationsPromise = volunteerResult.data
    ? admin
        .schema("ymhub")
        .from("registration_snapshots")
        .select("ymhub_activity_id")
        .eq("volunteer_id", volunteerResult.data.id)
        .eq("state", "registered")
        .limit(2000)
    : Promise.resolve({ data: [], error: null });

  const [rosterResult, syncResult, registrationsResult] = await Promise.all([
    rosterPromise,
    syncPromise,
    registrationsPromise,
  ]);

  if (rosterResult.error || syncResult.error || registrationsResult.error) {
    console.error("Unable to resolve Event Guide registrations", {
      rosterCode: rosterResult.error?.code,
      syncCode: syncResult.error?.code,
      registrationsCode: registrationsResult.error?.code,
      userId,
    });
    return { state: "unavailable" };
  }

  const syncStatus = syncResult.data;
  const registrationSyncOutcome = volunteerResult.data
    ? getYmHubSyncOutcome(syncStatus)
    : "not_linked";

  return {
    state: "authenticated",
    viewer: {
      userId,
      email,
      accountStatus: accountResult.data.status,
      roles,
      isStaffPreview: false,
      volunteerId: volunteerResult.data?.id ?? null,
      rosterEventIds: new Set(
        (rosterResult.data ?? []).map(({ event_id }) => String(event_id)),
      ),
      registeredActivityIds: new Set(
        (registrationsResult.data ?? []).map(({ ymhub_activity_id }) =>
          String(ymhub_activity_id),
        ),
      ),
      registrationSyncOutcome,
      registrationsSyncedAt: syncStatus?.registrations_synced_at ?? null,
    },
  };
}

export async function getPermittedEventGuideIds(
  viewer: EventGuideViewer,
): Promise<ReadonlySet<string> | null> {
  if (viewer.isStaffPreview) {
    return null;
  }

  const permitted = new Set(viewer.rosterEventIds);
  if (viewer.registeredActivityIds.size === 0) {
    return permitted;
  }

  const admin = getPhaseOneAdminClient();
  const { data: events, error: eventsError } = await admin
    .from("phaseone_events")
    .select("id, external_opportunity_id, ymhub_activity_id")
    .eq("is_published", true)
    .limit(2000);

  if (eventsError || !events) {
    console.error("Unable to match Event Guides to YM Hub activities", {
      code: eventsError?.code,
    });
    throw new Error("Event Guide registration matching is unavailable");
  }

  const externalOpportunityIds = events
    .map(({ external_opportunity_id }) => external_opportunity_id)
    .filter((value): value is string => Boolean(value));
  const externalSourceKeys = new Map<string, string>();

  if (externalOpportunityIds.length > 0) {
    const { data: opportunities, error: opportunitiesError } = await admin
      .from("phaseone_external_opportunities")
      .select("id, source_key")
      .in("id", externalOpportunityIds)
      .limit(2000);

    if (opportunitiesError || !opportunities) {
      console.error("Unable to match external opportunities to Event Guides", {
        code: opportunitiesError?.code,
      });
      throw new Error("Event Guide registration matching is unavailable");
    }

    opportunities.forEach(({ id, source_key }) => {
      externalSourceKeys.set(String(id), String(source_key));
    });
  }

  for (const event of events) {
    const directActivityId = event.ymhub_activity_id?.trim();
    const externalActivityId = event.external_opportunity_id
      ? externalSourceKeys.get(event.external_opportunity_id)
      : null;

    if (
      (directActivityId && viewer.registeredActivityIds.has(directActivityId)) ||
      (externalActivityId && viewer.registeredActivityIds.has(externalActivityId))
    ) {
      permitted.add(event.id);
    }
  }

  return permitted;
}

export async function authorizeEventGuideSlug(
  slug: string,
  options: Readonly<{ requirePublished?: boolean }> = {},
): Promise<EventGuideAuthorizationResult> {
  const viewerResult = await getEventGuideViewer();
  if (viewerResult.state !== "authenticated") {
    return viewerResult;
  }

  const admin = getPhaseOneAdminClient();
  const { data: event, error } = await admin
    .from("phaseone_events")
    .select("id, slug, is_published")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Unable to load Event Guide authorization target", {
      code: error.code,
      slug,
    });
    return { state: "unavailable" };
  }
  if (!event) {
    return { state: "not_found" };
  }

  const requirePublished = options.requirePublished ?? true;
  if (requirePublished && !event.is_published) {
    return { state: "not_found" };
  }

  if (viewerResult.viewer.isStaffPreview && (!requirePublished || event.is_published)) {
    return { state: "allowed", viewer: viewerResult.viewer, event };
  }

  if (!event.is_published) {
    return { state: "not_registered", viewer: viewerResult.viewer };
  }

  const permittedEventIds = await getPermittedEventGuideIds(viewerResult.viewer);
  if (permittedEventIds?.has(event.id)) {
    return { state: "allowed", viewer: viewerResult.viewer, event };
  }

  return { state: "not_registered", viewer: viewerResult.viewer };
}
