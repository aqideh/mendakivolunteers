export type RecruitmentReservation = {
  timeslot_id: string;
  registration:
    | { id: string; volunteer_id: string | null; status: string }
    | { id: string; volunteer_id: string | null; status: string }[]
    | null;
};

export type RecruitmentRosterPlacement = {
  id: string;
  timeslot_id: string;
  volunteer_id: string | null;
  registration_id: string | null;
  attendance_person_key: string | null;
  entry_method: string;
  source_assignment_status: string | null;
};

export type RecruitmentCounts = {
  reserved: number;
  pending: number;
  confirmed: number;
  manual: number;
  recruited: number;
};

function personKey(volunteerId: string | null, fallback: string) {
  return volunteerId ? `volunteer:${volunteerId}` : fallback;
}

/**
 * Recruitment measures confirmed online placements and manually rostered people.
 * Pending applications affect intake reservations but never recruitment progress.
 * Confirmed online registrations are also copied into the roster, so roster
 * rows must not be added a second time.
 */
export function recruitmentCountsByTimeslot(
  reservations: readonly RecruitmentReservation[],
  roster: readonly RecruitmentRosterPlacement[],
): Map<string, RecruitmentCounts> {
  const counts = new Map<string, RecruitmentCounts>();
  const people = new Map<string, Set<string>>();
  const confirmedRegistrationIds = new Map<string, Set<string>>();

  function forShift(timeslotId: string) {
    let current = counts.get(timeslotId);
    if (!current) {
      current = { reserved: 0, pending: 0, confirmed: 0, manual: 0, recruited: 0 };
      counts.set(timeslotId, current);
    }
    return current;
  }

  for (const selection of reservations) {
    const registration = Array.isArray(selection.registration)
      ? selection.registration[0]
      : selection.registration;
    if (!registration || !["pending", "confirmed"].includes(registration.status)) continue;

    const current = forShift(selection.timeslot_id);
    current.reserved += 1;
    if (registration.status === "pending") {
      current.pending += 1;
      continue;
    }

    current.confirmed += 1;
    let shiftPeople = people.get(selection.timeslot_id);
    if (!shiftPeople) {
      shiftPeople = new Set();
      people.set(selection.timeslot_id, shiftPeople);
    }
    shiftPeople.add(personKey(registration.volunteer_id, `registration:${registration.id}`));

    let shiftRegistrations = confirmedRegistrationIds.get(selection.timeslot_id);
    if (!shiftRegistrations) {
      shiftRegistrations = new Set();
      confirmedRegistrationIds.set(selection.timeslot_id, shiftRegistrations);
    }
    shiftRegistrations.add(registration.id);
  }

  for (const row of roster) {
    // Online confirmations are already counted from registration selections.
    if (row.entry_method === "keluarga_registration") continue;
    if (["withdrawn", "cancelled", "canceled", "rejected", "invalidated_historical_shift_match"]
      .includes(row.source_assignment_status ?? "")) continue;
    if (row.registration_id && confirmedRegistrationIds.get(row.timeslot_id)?.has(row.registration_id)) {
      continue;
    }

    const current = forShift(row.timeslot_id);
    let shiftPeople = people.get(row.timeslot_id);
    if (!shiftPeople) {
      shiftPeople = new Set();
      people.set(row.timeslot_id, shiftPeople);
    }
    const key = personKey(
      row.volunteer_id,
      row.attendance_person_key ? `attendance:${row.attendance_person_key}` : `roster:${row.id}`,
    );
    if (shiftPeople.has(key)) continue;
    shiftPeople.add(key);
    current.manual += 1;
  }

  for (const [timeslotId, current] of counts) {
    current.recruited = people.get(timeslotId)?.size ?? 0;
  }

  return counts;
}
