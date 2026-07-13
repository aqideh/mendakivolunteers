import type { YmHubVolunteer } from "@/lib/ymhub/types";

export const MOCK_YMHUB_VOLUNTEERS = [
  {
    externalVolunteerId: "PROTO-VOL-000001",
    status: "PROTO_VERIFIED",
    sourceUpdatedAt: "2026-07-01T08:00:00.000Z",
  },
  {
    externalVolunteerId: "PROTO-VOL-000002",
    status: "PROTO_PENDING",
    sourceUpdatedAt: "2026-07-05T02:30:00.000Z",
  },
  {
    externalVolunteerId: "PROTO-VOL-000003",
    status: "PROTO_INACTIVE",
    sourceUpdatedAt: "2026-07-08T11:15:00.000Z",
  },
] as const satisfies readonly YmHubVolunteer[];
