import type { AppRole } from "@/types/database";

export const staffInviteRoleValues = [
  "support_officer",
  "content_editor",
  "pathway_manager",
  "publisher",
  "attendance_manager",
  "programme_manager",
  "gamification_manager",
  "auditor",
  "admin",
] as const satisfies readonly AppRole[];

export type StaffInviteRole = (typeof staffInviteRoleValues)[number];

export const staffInviteRoleOptions: readonly Readonly<{
  value: StaffInviteRole;
  label: string;
  description: string;
}>[] = [
  {
    value: "support_officer",
    label: "Volunteer manager / support officer",
    description:
      "Review recruitment applications and run volunteer-support workflows.",
  },
  {
    value: "content_editor",
    label: "Content editor",
    description:
      "Create and edit content drafts. Publishing requires the Publisher role.",
  },
  {
    value: "pathway_manager",
    label: "Pathway manager",
    description:
      "Manage volunteer pathway content and confirmed pathway positions.",
  },
  {
    value: "publisher",
    label: "Publisher",
    description:
      "Edit content and publish, schedule, unpublish or archive KELUARGA content.",
  },
  {
    value: "attendance_manager",
    label: "Event operations",
    description:
      "Run registration review, rosters, check-in/out, attendance and event-day workflows without programme editing.",
  },
  {
    value: "programme_manager",
    label: "Programme & event manager",
    description:
      "Create, duplicate and edit programmes, opportunity details, schedules and Event Guides. Includes Event Operations access.",
  },
  {
    value: "gamification_manager",
    label: "Points & badges manager",
    description:
      "Manage points, badges and other gamification or recognition workflows.",
  },
  {
    value: "auditor",
    label: "Auditor",
    description:
      "Read audit and oversight data where audit access is implemented. Does not grant operational management access.",
  },
  {
    value: "admin",
    label: "Administrator",
    description:
      "Full KELUARGA administration, including staff role management. This does not grant MakLom access.",
  },
];

export function getStaffRoleOption(role: StaffInviteRole) {
  return staffInviteRoleOptions.find((option) => option.value === role);
}
