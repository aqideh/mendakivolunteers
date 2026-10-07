import "server-only";

import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";

export type AttendanceIdentityState =
  | "signed_out"
  | "inactive"
  | "unlinked"
  | "not_rostered"
  | "ambiguous_roster"
  | "unavailable"
  | "matched";

export type AttendanceIdentityResult =
  | Readonly<{ state: Exclude<AttendanceIdentityState, "matched"> }>
  | Readonly<{
      state: "matched";
      userId: string;
      volunteerId: string;
      rosterId: string;
      volunteerName: string;
      personKey: string;
    }>;

async function authenticatedVolunteer() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError) {
    console.error("Unable to verify attendance account session", {
      code: claimsError.code,
      status: claimsError.status,
    });
    return { state: "unavailable" as const };
  }

  const userId = claimsData?.claims?.sub;
  if (!userId) {
    return { state: "signed_out" as const };
  }

  const admin = getPhaseOneAdminClient();
  const [accountResult, volunteerResult] = await Promise.all([
    admin
      .schema("core")
      .from("user_accounts")
      .select("status")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .schema("core")
      .from("volunteers")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle(),
  ]);

  if (accountResult.error || volunteerResult.error) {
    console.error("Unable to resolve attendance volunteer identity", {
      accountCode: accountResult.error?.code,
      volunteerCode: volunteerResult.error?.code,
      userId,
    });
    return { state: "unavailable" as const };
  }

  if (accountResult.data?.status !== "active") {
    return { state: "inactive" as const };
  }

  if (!volunteerResult.data?.id) {
    return { state: "unlinked" as const };
  }

  return {
    state: "linked" as const,
    userId,
    volunteerId: String(volunteerResult.data.id),
  };
}

export async function resolveAuthenticatedAttendancePerson(
  eventId: string,
  timeslotId?: string,
): Promise<AttendanceIdentityResult> {
  const identity = await authenticatedVolunteer();
  if (identity.state !== "linked") return identity;

  const admin = getPhaseOneAdminClient();
  let query = admin
    .from("phaseone_roster")
    .select("id, volunteer_name, attendance_person_key")
    .eq("event_id", eventId)
    .eq("volunteer_id", identity.volunteerId)
    .or("source_assignment_status.is.null,source_assignment_status.neq.invalidated_historical_shift_match")
    .limit(20);

  if (timeslotId) {
    query = query.eq("timeslot_id", timeslotId);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error("Unable to resolve authenticated attendance roster entry", {
      code: error?.code,
      eventId,
      timeslotId,
      userId: identity.userId,
      volunteerId: identity.volunteerId,
    });
    return { state: "unavailable" };
  }

  if (data.length === 0) {
    return { state: "not_rostered" };
  }

  const personKeys = new Set(
    data.map((row) => String(row.attendance_person_key)),
  );

  if (data.length !== 1 || personKeys.size !== 1) {
    console.error("Ambiguous attendance roster mapping for authenticated volunteer", {
      eventId,
      timeslotId,
      userId: identity.userId,
      volunteerId: identity.volunteerId,
      rosterRows: data.length,
      personKeys: personKeys.size,
    });
    return { state: "ambiguous_roster" };
  }

  const row = data[0]!;
  return {
    state: "matched",
    userId: identity.userId,
    volunteerId: identity.volunteerId,
    rosterId: String(row.id),
    volunteerName: String(row.volunteer_name),
    personKey: String(row.attendance_person_key),
  };
}
