export type AdminCapability =
  | "view_overview"
  | "view_website_analytics"
  | "operate_events"
  | "manage_inventory"
  | "manage_volunteer_data"
  | "onboard_volunteers"
  | "manage_content"
  | "manage_recognition"
  | "manage_staff"
  | "access_maklom";

export type AdminCapabilities = Readonly<Record<AdminCapability, boolean>>;

/**
 * Navigation capabilities mirror the existing server-side role model.
 * They are for presentation only; route and mutation authorization remains server-side.
 */
export function getAdminCapabilities(roles: readonly string[]): AdminCapabilities {
  const isAdmin = roles.includes("admin");
  const isVolTeam = roles.includes("volteam");
  const isStaff = roles.includes("staff");
  const isVolunteerLeader = roles.includes("volunteer_leader");
  const fullAdmin = isAdmin || isVolTeam;

  return {
    view_overview: fullAdmin,
    view_website_analytics: fullAdmin,
    operate_events: fullAdmin || isStaff || isVolunteerLeader,
    manage_inventory: fullAdmin,
    manage_volunteer_data: fullAdmin,
    onboard_volunteers: isAdmin,
    manage_content: fullAdmin,
    manage_recognition: fullAdmin,
    manage_staff: isAdmin,
    access_maklom: isAdmin,
  };
}
