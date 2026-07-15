import type {
  YmHubAttendanceState,
  YmHubRegistrationState,
} from "@/types/database";

type SyncStatus = Readonly<{
  last_failed_at: string | null;
  last_successful_at: string | null;
}>;

type AttendanceRecord = Readonly<{
  state: YmHubAttendanceState;
  verified_hours: number | null;
}>;

export type YmHubSyncOutcome = "not_synced" | "synced" | "failed";

function parseTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    throw new Error("YM Hub sync status contains an invalid timestamp");
  }

  return timestamp;
}

export function getYmHubSyncOutcome(
  status: SyncStatus | null,
): YmHubSyncOutcome {
  if (!status) {
    return "not_synced";
  }

  if (
    status.last_failed_at &&
    (!status.last_successful_at ||
      parseTimestamp(status.last_failed_at) >
        parseTimestamp(status.last_successful_at))
  ) {
    return "failed";
  }

  if (status.last_successful_at) {
    return "synced";
  }

  throw new Error("YM Hub sync status has no recorded outcome");
}

export function getVerifiedHours(
  attendanceRecords: readonly AttendanceRecord[],
): number {
  return attendanceRecords.reduce((total, record) => {
    if (record.state !== "verified") {
      return total;
    }

    if (record.verified_hours === null) {
      throw new Error("Verified attendance is missing verified hours");
    }

    return total + record.verified_hours;
  }, 0);
}

export function getVerifiedHoursForRecord(record: AttendanceRecord): number {
  if (record.state !== "verified") {
    throw new Error("Attendance record is not verified");
  }

  if (record.verified_hours === null) {
    throw new Error("Verified attendance is missing verified hours");
  }

  return record.verified_hours;
}

export function formatYmHubState(
  state: YmHubRegistrationState | YmHubAttendanceState,
): string {
  switch (state) {
    case "registered":
      return "Registered";
    case "waitlisted":
      return "Waitlisted";
    case "pending":
      return "Pending verification";
    case "verified":
      return "Verified";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
  }
}
