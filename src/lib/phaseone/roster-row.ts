export type NonAttendanceStatus = "withdrawn" | "absent";

export type AttendanceStatus =
  | "pending"
  | "signed_in"
  | "signed_out"
  | NonAttendanceStatus
  | "anomaly";

export type ContinuationType =
  | "origin"
  | "scheduled"
  | "extended_on_site";

export type AttendanceLinkedShiftDTO = {
  timeslotId: string;
  continuationType: ContinuationType;
};

export type AttendanceReadModelDTO = {
  rosterId: string;
  status: AttendanceStatus;
  signedInAt: string | null;
  signedOutAt: string | null;
  nonAttendanceStatus: NonAttendanceStatus | null;
  nonAttendanceMarkedAt: string | null;
  updatedAt: string | null;
  sessionId: string | null;
  sessionCheckedInAt: string | null;
  sessionCheckedOutAt: string | null;
  continuationType: ContinuationType | null;
  directSignedInAt: string | null;
  directSignedOutAt: string | null;
  directNonAttendanceStatus: NonAttendanceStatus | null;
  directNonAttendanceMarkedAt: string | null;
  directUpdatedAt: string | null;
  linkedShifts: AttendanceLinkedShiftDTO[];
  usesInheritedSession: boolean;
};

export type RosterRowDTO = AttendanceReadModelDTO & {
  filterText: string;
  volunteerNeedsReview: boolean;
  nextTimeslotId: string | null;
};

export function attendanceStatusFor(
  signedInAt: string | null,
  signedOutAt: string | null,
  nonAttendanceStatus: string | null,
): AttendanceStatus {
  if (nonAttendanceStatus === "withdrawn" || nonAttendanceStatus === "absent") {
    return nonAttendanceStatus;
  }
  if (signedOutAt && !signedInAt) return "anomaly";
  if (signedOutAt) return "signed_out";
  if (signedInAt) return "signed_in";
  return "pending";
}

export function attendanceStatusLabel(status: AttendanceStatus): string {
  return {
    pending: "Not arrived",
    signed_in: "Checked in",
    signed_out: "Checked out",
    withdrawn: "Withdrawn",
    absent: "Absent",
    anomaly: "Needs review",
  }[status];
}

export function linkedShiftFor(
  row: Pick<AttendanceReadModelDTO, "linkedShifts">,
  timeslotId: string | null | undefined,
): AttendanceLinkedShiftDTO | undefined {
  if (!timeslotId) return undefined;
  return row.linkedShifts.find((shift) => shift.timeslotId === timeslotId);
}

export function rosterNeedsAttention(
  row: Pick<
    RosterRowDTO,
    "status" | "volunteerNeedsReview" | "nextTimeslotId" | "linkedShifts"
  >,
): boolean {
  if (row.status === "anomaly" || row.volunteerNeedsReview) return true;
  if (row.status !== "signed_in" || !row.nextTimeslotId) return false;
  return !linkedShiftFor(row, row.nextTimeslotId);
}

export function mergeAttendanceReadModel(
  row: RosterRowDTO,
  attendance: AttendanceReadModelDTO,
): RosterRowDTO {
  return {
    ...row,
    ...attendance,
    filterText: row.filterText,
    volunteerNeedsReview: row.volunteerNeedsReview,
    nextTimeslotId: row.nextTimeslotId,
  };
}
