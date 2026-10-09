import { describe, expect, it } from "vitest";
import { recruitmentCountsByTimeslot, type RecruitmentReservation, type RecruitmentRosterPlacement } from "./recruitment-progress";

const confirmed = (id: string, volunteer_id: string | null = id): RecruitmentReservation => ({
  timeslot_id: "shift-1",
  registration: { id, volunteer_id, status: "confirmed" },
});
const pending = (id: string): RecruitmentReservation => ({
  timeslot_id: "shift-1",
  registration: { id, volunteer_id: id, status: "pending" },
});
const manual = (id: string, volunteer_id: string | null = id): RecruitmentRosterPlacement => ({
  id,
  timeslot_id: "shift-1",
  volunteer_id,
  registration_id: null,
  attendance_person_key: `id:${id}`,
  entry_method: "staff_database",
  source_assignment_status: "staff_added_from_database",
});

describe("recruitment progress", () => {
  it("includes confirmed and manual, but never pending", () => {
    const counts = recruitmentCountsByTimeslot(
      [confirmed("online"), pending("pending-1"), pending("pending-2")],
      [manual("manual-1"), manual("manual-2")],
    ).get("shift-1");
    expect(counts).toEqual({ reserved: 3, pending: 2, confirmed: 1, manual: 2, recruited: 3 });
  });

  it("does not double count the online confirmation mirrored into the roster", () => {
    const counts = recruitmentCountsByTimeslot([confirmed("online", "volunteer-1")], [
      { ...manual("roster-1", "volunteer-1"), entry_method: "keluarga_registration", registration_id: "online" },
      manual("manually-added-duplicate", "volunteer-1"),
    ]).get("shift-1");
    expect(counts?.recruited).toBe(1);
    expect(counts?.manual).toBe(0);
  });

  it("excludes invalidated assignments and counts each shift independently", () => {
    const counts = recruitmentCountsByTimeslot([], [
      { ...manual("invalid"), source_assignment_status: "invalidated_historical_shift_match" },
      manual("valid"),
      { ...manual("other-shift"), timeslot_id: "shift-2" },
    ]);
    expect(counts.get("shift-1")?.recruited).toBe(1);
    expect(counts.get("shift-2")?.recruited).toBe(1);
  });

  it("does not count pending registrations even if other roster data is present", () => {
    const counts = recruitmentCountsByTimeslot([pending("pending")], []);
    expect(counts.get("shift-1")?.recruited).toBe(0);
  });
});
