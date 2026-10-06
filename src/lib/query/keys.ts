export const rosterKeys = {
  all: ["roster"] as const,
  event: (eventId: string) => [...rosterKeys.all, "event", eventId] as const,
  shift: (eventId: string, timeslotId: string) =>
    [...rosterKeys.event(eventId), "shift", timeslotId] as const,
};

export const attendanceKeys = {
  all: ["attendance"] as const,
  event: (eventId: string) => [...attendanceKeys.all, "event", eventId] as const,
};

export const volunteerKeys = {
  all: ["volunteers"] as const,
  directory: () => [...volunteerKeys.all, "directory"] as const,
};

export const reconciliationKeys = {
  all: ["reconciliation"] as const,
  batch: (batchId: string) => [...reconciliationKeys.all, "batch", batchId] as const,
};

export const leadKeys = {
  all: ["volunteer-leads"] as const,
  list: () => [...leadKeys.all, "list"] as const,
};
