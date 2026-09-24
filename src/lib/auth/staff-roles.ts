import type { AppRole } from "@/types/database";

export const staffInviteRoleValues = [
  "volunteer_leader",
  "staff",
  "volteam",
  "admin",
] as const satisfies readonly AppRole[];

export type StaffInviteRole = (typeof staffInviteRoleValues)[number];

export const staffInviteRoleOptions: readonly Readonly<{
  value: StaffInviteRole;
  label: string;
  description: string;
}>[] = [
  {
    value: "volunteer_leader",
    label: "Volunteer Leader",
    description:
      "Basic event-day operations: view rosters, search/filter volunteers, check in/out, mark absent or withdrawn, continue attendance across adjacent shifts, and display attendance QR codes. No ratings, insights, exports, roster uploads, reconciliation, registration decisions or event editing.",
  },
  {
    value: "staff",
    label: "Staff",
    description:
      "Full Event Operations for existing programmes, including rosters, walk-ins, attendance corrections, registration review, reconciliation, reports, ratings and insights. Cannot create, duplicate, structurally edit or delete programmes/events.",
  },
  {
    value: "volteam",
    label: "VolTeam",
    description:
      "All KELUARGA operational and content access, including programme creation/editing, recruitment, pathways, points and badges. Cannot manage staff access and does not receive MakLom access.",
  },
  {
    value: "admin",
    label: "Admin",
    description:
      "All KELUARGA access, staff access management, and MakLom administrator access.",
  },
];

export function getStaffRoleOption(role: StaffInviteRole) {
  return staffInviteRoleOptions.find((option) => option.value === role);
}
