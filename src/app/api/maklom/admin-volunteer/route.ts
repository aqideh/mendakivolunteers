import { NextResponse } from "next/server";

import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

type AdminActionRequest = Readonly<{
  action?: "inspect" | "remove-test-record";
  coreVolunteerId?: string;
  confirmation?: string;
}>;

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    return (
      url.hostname === "voldatabasetool.vercel.app" ||
      url.hostname === "voldatabasetool-mendakivolunteers.vercel.app" ||
      /^voldatabasetool-[a-z0-9-]+-mendakivolunteers\.vercel\.app$/.test(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}

function responseHeaders(origin: string | null) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
  });
  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return headers;
}

function json(origin: string | null, body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: responseHeaders(origin),
  });
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: responseHeaders(origin),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return json(null, { error: "Origin not allowed." }, 403);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json(origin, { error: "Authentication required." }, 401);
  }

  const admin = getPhaseOneAdminClient();
  const token = authorization.slice("Bearer ".length).trim();
  const actorResult = await admin.auth.getUser(token);
  const actor = actorResult.data.user;

  if (actorResult.error || !actor) {
    return json(origin, { error: "Authentication required." }, 401);
  }

  const membershipResult = await admin
    .from("app_members")
    .select("role,active")
    .eq("user_id", actor.id)
    .maybeSingle();

  if (membershipResult.error) {
    console.error("MakLom admin membership lookup failed", membershipResult.error);
    return json(origin, { error: "MakLom access could not be checked." }, 500);
  }

  if (!membershipResult.data?.active || membershipResult.data.role !== "admin") {
    return json(origin, { error: "MakLom admin access is required." }, 403);
  }

  let body: AdminActionRequest;
  try {
    body = await request.json();
  } catch {
    return json(origin, { error: "Invalid request." }, 400);
  }

  const coreVolunteerId = body.coreVolunteerId?.trim();
  if (!coreVolunteerId) {
    return json(origin, { error: "Volunteer record is required." }, 400);
  }

  const targetResult = await admin
    .schema("core")
    .from("volunteers")
    .select(
      "id,auth_user_id,display_name,volunteer_code,ymhub_volunteer_id,ymhub_status,official_hours_12_months,official_hours_24_months",
    )
    .eq("id", coreVolunteerId)
    .maybeSingle();

  if (targetResult.error) {
    console.error("MakLom admin volunteer lookup failed", targetResult.error);
    return json(origin, { error: "Volunteer could not be loaded." }, 500);
  }
  if (!targetResult.data) {
    return json(origin, { error: "Volunteer could not be found." }, 404);
  }

  const target = targetResult.data;

  const [profileResult, registrationResult, recruitmentResult, profileDetailsResult] =
    await Promise.all([
      admin
        .from("volunteers")
        .select("id")
        .eq("core_volunteer_id", coreVolunteerId)
        .maybeSingle(),
      admin
        .from("keluarga_registrations")
        .select("id")
        .eq("volunteer_id", coreVolunteerId),
      admin
        .from("keluarga_recruitment_applications")
        .select("id")
        .eq("volunteer_id", coreVolunteerId),
      admin
        .from("keluarga_volunteer_profiles")
        .select("avatar_path")
        .eq("volunteer_id", coreVolunteerId)
        .maybeSingle(),
    ]);

  if (
    profileResult.error ||
    registrationResult.error ||
    recruitmentResult.error ||
    profileDetailsResult.error
  ) {
    console.error("MakLom admin volunteer preflight failed", {
      profile: profileResult.error,
      registrations: registrationResult.error,
      recruitment: recruitmentResult.error,
      profileDetails: profileDetailsResult.error,
    });
    return json(origin, { error: "Volunteer checks could not be completed." }, 500);
  }

  const profileId = profileResult.data?.id ?? null;
  const registrationIds = (registrationResult.data ?? []).map((row) => row.id);

  const directRosterResult = await admin
    .from("phaseone_roster")
    .select("id")
    .eq("volunteer_id", coreVolunteerId);

  const registrationRosterResult =
    registrationIds.length > 0
      ? await admin
          .from("phaseone_roster")
          .select("id")
          .in("registration_id", registrationIds)
      : { data: [], error: null };

  if (directRosterResult.error || registrationRosterResult.error) {
    console.error("MakLom admin roster lookup failed", {
      direct: directRosterResult.error,
      registration: registrationRosterResult.error,
    });
    return json(origin, { error: "Volunteer checks could not be completed." }, 500);
  }

  const rosterIds = Array.from(
    new Set([
      ...(directRosterResult.data ?? []).map((row) => row.id),
      ...(registrationRosterResult.data ?? []).map((row) => row.id),
    ]),
  );

  async function countPublic(table: string, column: string, value: string | null) {
    if (!value) return 0;
    const result = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, value);
    if (result.error) throw result.error;
    return result.count ?? 0;
  }

  async function countSchema(
    schema: "gamification" | "pathways" | "ymhub",
    table: string,
    column: string,
    value: string,
  ) {
    const result = await admin
      .schema(schema)
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, value);
    if (result.error) throw result.error;
    return result.count ?? 0;
  }

  async function countRoster(table: string, column = "roster_id") {
    if (rosterIds.length === 0) return 0;
    const result = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(column, rosterIds);
    if (result.error) throw result.error;
    return result.count ?? 0;
  }

  const blockers: string[] = [];

  try {
    if (target.auth_user_id === actor.id) {
      blockers.push("You cannot remove the account you are currently using.");
    }

    if (target.auth_user_id) {
      const [staffRoleResult, maklomAccessResult] = await Promise.all([
        admin
          .schema("core")
          .from("user_roles")
          .select("*", { count: "exact", head: true })
          .eq("user_id", target.auth_user_id)
          .neq("role", "volunteer"),
        admin
          .from("app_members")
          .select("user_id")
          .eq("user_id", target.auth_user_id)
          .eq("active", true)
          .maybeSingle(),
      ]);

      if (staffRoleResult.error || maklomAccessResult.error) {
        throw staffRoleResult.error ?? maklomAccessResult.error;
      }
      if ((staffRoleResult.count ?? 0) > 0) {
        blockers.push("This account has staff access.");
      }
      if (maklomAccessResult.data) {
        blockers.push("This account has active MakLom access.");
      }
    }

    if (
      target.ymhub_volunteer_id ||
      target.ymhub_status ||
      numeric(target.official_hours_12_months) > 0 ||
      numeric(target.official_hours_24_months) > 0
    ) {
      blockers.push("This volunteer has retained YM Hub or official-hours history.");
    }

    if (profileDetailsResult.data?.avatar_path) {
      blockers.push("This volunteer has an uploaded profile photo. Remove it first.");
    }

    if ((await countPublic("attendance_log", "volunteer_id", profileId)) > 0) {
      blockers.push("MakLom attendance history exists.");
    }

    const rosterHistoryCounts = await Promise.all([
      countRoster("phaseone_attendance"),
      countRoster("phaseone_attendance_audit"),
      countRoster("phaseone_attendance_session_audit"),
      countRoster("phaseone_attendance_sessions", "origin_roster_id"),
      countRoster("phaseone_event_feedback"),
      countRoster("phaseone_volunteer_insights"),
      countRoster("phaseone_volunteer_reviews"),
    ]);

    if (rosterHistoryCounts.some((count) => count > 0)) {
      blockers.push("Keluarga attendance, feedback, insight or review history exists.");
    }

    const [
      contributionCount,
      creditCount,
      shirtCount,
      inboxCount,
      profileChangeCount,
      historicalCoreCount,
      historicalProfileCount,
    ] = await Promise.all([
      countPublic("volunteer_contributions", "volunteer_id", coreVolunteerId),
      countPublic("keluarga_contribution_credits", "volunteer_id", coreVolunteerId),
      countPublic("volunteer_shirt_issuances", "volunteer_id", coreVolunteerId),
      countPublic("maklom_profile_inbox", "volunteer_id", coreVolunteerId),
      countPublic("volunteer_profile_change_inbox", "volunteer_id", coreVolunteerId),
      countPublic(
        "historical_attendance_import_rows",
        "matched_core_volunteer_id",
        coreVolunteerId,
      ),
      countPublic(
        "historical_attendance_import_rows",
        "matched_volunteer_id",
        profileId,
      ),
    ]);

    if (contributionCount + creditCount > 0) {
      blockers.push("Contribution-hour history exists.");
    }
    if (shirtCount > 0) {
      blockers.push("Shirt issuance history exists.");
    }
    if (inboxCount > 0) {
      blockers.push("MakLom insight or review history exists.");
    }
    if (profileChangeCount > 0) {
      blockers.push("Volunteer profile change history exists.");
    }
    if (historicalCoreCount + historicalProfileCount > 0) {
      blockers.push("Historical attendance import history exists.");
    }

    const [pointCount, badgeCount, positionCount] = await Promise.all([
      countSchema(
        "gamification",
        "point_ledger_entries",
        "volunteer_id",
        coreVolunteerId,
      ),
      countSchema("gamification", "volunteer_badges", "volunteer_id", coreVolunteerId),
      countSchema("pathways", "volunteer_positions", "volunteer_id", coreVolunteerId),
    ]);

    if (pointCount + badgeCount > 0) {
      blockers.push("Points or badge history exists.");
    }
    if (positionCount > 0) {
      blockers.push("Volunteer pathway history exists.");
    }

    const leadResult = profileId
      ? await admin
          .from("volunteer_leads")
          .select("*", { count: "exact", head: true })
          .or(
            `keluarga_volunteer_id.eq.${coreVolunteerId},converted_volunteer_id.eq.${profileId}`,
          )
      : await admin
          .from("volunteer_leads")
          .select("*", { count: "exact", head: true })
          .eq("keluarga_volunteer_id", coreVolunteerId);

    if (leadResult.error) throw leadResult.error;
    if ((leadResult.count ?? 0) > 0) {
      blockers.push("A converted Volunteer Lead is linked to this volunteer.");
    }

    const ymhubCounts = await Promise.all([
      countSchema("ymhub", "assignment_snapshots", "volunteer_id", coreVolunteerId),
      countSchema("ymhub", "attendance_snapshots", "volunteer_id", coreVolunteerId),
      countSchema("ymhub", "registration_snapshots", "volunteer_id", coreVolunteerId),
      countSchema("ymhub", "volunteer_sync_status", "volunteer_id", coreVolunteerId),
    ]);

    if (ymhubCounts.some((count) => count > 0)) {
      blockers.push("YM Hub snapshot history exists.");
    }
  } catch (error) {
    console.error("MakLom admin detailed preflight failed", error);
    return json(origin, { error: "Volunteer checks could not be completed." }, 500);
  }

  const summary = {
    eligible: blockers.length === 0,
    blockers,
    volunteerId: target.id,
    volunteerCode: target.volunteer_code,
    displayName: target.display_name || target.volunteer_code,
    hasAccount: Boolean(target.auth_user_id),
    hasProfilePhoto: Boolean(profileDetailsResult.data?.avatar_path),
    registrationCount: registrationIds.length,
    rosterCount: rosterIds.length,
    recruitmentApplicationCount: recruitmentResult.data?.length ?? 0,
  };

  if (body.action !== "remove-test-record") {
    return json(origin, summary);
  }

  if (blockers.length > 0) {
    return json(
      origin,
      {
        ...summary,
        error: "This record has retained volunteer history and cannot be removed here.",
      },
      409,
    );
  }

  if (
    (body.confirmation ?? "").trim().toUpperCase() !==
    target.volunteer_code.toUpperCase()
  ) {
    return json(
      origin,
      {
        ...summary,
        error: "Type the volunteer ID exactly to confirm removal.",
      },
      400,
    );
  }

  try {
    if (target.auth_user_id) {
      const authRemoval = await admin.auth.admin.deleteUser(target.auth_user_id);
      if (authRemoval.error) {
        return json(
          origin,
          {
            ...summary,
            error:
              "The sign-in account could not be removed. If this account owns uploaded files, remove those files first.",
          },
          409,
        );
      }
    }

    if (rosterIds.length > 0) {
      const rosterRemoval = await admin.from("phaseone_roster").delete().in("id", rosterIds);
      if (rosterRemoval.error) throw rosterRemoval.error;
    }

    const registrationRemoval = await admin
      .from("keluarga_registrations")
      .delete()
      .eq("volunteer_id", coreVolunteerId);
    if (registrationRemoval.error) throw registrationRemoval.error;

    const recruitmentRemoval = await admin
      .from("keluarga_recruitment_applications")
      .delete()
      .eq("volunteer_id", coreVolunteerId);
    if (recruitmentRemoval.error) throw recruitmentRemoval.error;

    const profileRemoval = await admin
      .from("volunteers")
      .delete()
      .eq("core_volunteer_id", coreVolunteerId);
    if (profileRemoval.error) throw profileRemoval.error;

    const coreRemoval = await admin
      .schema("core")
      .from("volunteers")
      .delete()
      .eq("id", coreVolunteerId);
    if (coreRemoval.error) throw coreRemoval.error;

    const auditResult = await admin.from("audit_log").insert({
      actor_user_id: actor.id,
      entity_type: "volunteer_admin_action",
      entity_id: target.volunteer_code,
      action: "remove_test_record",
      details: {
        canonical_volunteer_id: coreVolunteerId,
        display_name: target.display_name,
        removed_registrations: registrationIds.length,
        removed_roster_rows: rosterIds.length,
        removed_recruitment_applications: recruitmentResult.data?.length ?? 0,
        removed_auth_account: Boolean(target.auth_user_id),
      },
    });

    if (auditResult.error) {
      console.error("MakLom admin action audit write failed", auditResult.error);
    }

    return json(origin, {
      removed: true,
      volunteerCode: target.volunteer_code,
      registrationCount: registrationIds.length,
      rosterCount: rosterIds.length,
    });
  } catch (error) {
    console.error("MakLom admin volunteer action failed", error);
    return json(
      origin,
      {
        error:
          "The test record could not be fully removed. Review it before trying the action again.",
      },
      500,
    );
  }
}
