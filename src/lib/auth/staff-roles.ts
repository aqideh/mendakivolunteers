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
}>[] = [
  { value: "support_officer", label: "Volunteer manager / support officer" },
  { value: "content_editor", label: "Content editor" },
  { value: "pathway_manager", label: "Pathway manager" },
  { value: "publisher", label: "Publisher" },
  { value: "attendance_manager", label: "Event operations" },
  { value: "programme_manager", label: "Programme & event manager" },
  { value: "gamification_manager", label: "Points & badges manager" },
  { value: "auditor", label: "Auditor" },
  { value: "admin", label: "Administrator" },
];
