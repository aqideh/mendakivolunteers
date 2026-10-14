import type { AccountStatus } from "@/types/database";
import {
  staffInviteRoleValues,
  type StaffInviteRole,
} from "@/lib/auth/staff-roles";

export type StaffDirectoryAccount = Readonly<{
  id: string;
  name: string | null;
  email: string;
  status: AccountStatus;
  role: StaffInviteRole;
  lastSignInAt: string | null;
}>;

export type StaffDirectorySort =
  | "name-asc"
  | "name-desc"
  | "recent"
  | "oldest"
  | "role-asc"
  | "role-desc";

export type StaffSignInFilter = "all" | "recent" | "older" | "never";

export type StaffDirectoryFilters = Readonly<{
  query: string;
  role: StaffInviteRole | "all";
  signIn: StaffSignInFilter;
  sort: StaffDirectorySort;
}>;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function filterStaffDirectory(
  accounts: readonly StaffDirectoryAccount[],
  filters: StaffDirectoryFilters,
  now = Date.now(),
): StaffDirectoryAccount[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const cutoff = now - THIRTY_DAYS_MS;
  const filtered = accounts.filter((account) => {
    if (
      query &&
      !account.email.toLocaleLowerCase().includes(query) &&
      !account.name?.toLocaleLowerCase().includes(query)
    ) {
      return false;
    }
    if (filters.role !== "all" && account.role !== filters.role) return false;

    const lastSignIn = account.lastSignInAt
      ? Date.parse(account.lastSignInAt)
      : NaN;
    const hasSignedIn = Number.isFinite(lastSignIn);

    switch (filters.signIn) {
      case "never":
        return !hasSignedIn;
      case "recent":
        return hasSignedIn && lastSignIn >= cutoff;
      case "older":
        return hasSignedIn && lastSignIn < cutoff;
      default:
        return true;
    }
  });

  return filtered.sort((left, right) => {
    const tieBreak = left.email.localeCompare(right.email, undefined, {
      sensitivity: "base",
    });
    if (filters.sort === "name-asc" || filters.sort === "name-desc") {
      const direction = filters.sort === "name-asc" ? 1 : -1;
      const leftName = left.name || left.email;
      const rightName = right.name || right.email;
      return (
        direction *
          leftName.localeCompare(rightName, undefined, { sensitivity: "base" }) ||
        tieBreak
      );
    }
    if (filters.sort === "role-asc" || filters.sort === "role-desc") {
      const direction = filters.sort === "role-asc" ? 1 : -1;
      return (
        direction *
          (staffInviteRoleValues.indexOf(left.role) -
            staffInviteRoleValues.indexOf(right.role)) ||
        tieBreak
      );
    }

    const leftTime = left.lastSignInAt ? Date.parse(left.lastSignInAt) : NaN;
    const rightTime = right.lastSignInAt ? Date.parse(right.lastSignInAt) : NaN;
    const leftValid = Number.isFinite(leftTime);
    const rightValid = Number.isFinite(rightTime);
    if (!leftValid || !rightValid) {
      if (leftValid !== rightValid) return leftValid ? -1 : 1;
      return tieBreak;
    }
    return (filters.sort === "recent" ? rightTime - leftTime : leftTime - rightTime) || tieBreak;
  });
}
