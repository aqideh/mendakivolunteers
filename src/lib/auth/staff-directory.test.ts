import { describe, expect, it } from "vitest";

import {
  filterStaffDirectory,
  type StaffDirectoryAccount,
  type StaffDirectoryFilters,
} from "./staff-directory";

const accounts: StaffDirectoryAccount[] = [
  {
    id: "1",
    name: "Zara Ali",
    email: "zara@mendaki.org.sg",
    role: "staff",
    status: "active",
    lastSignInAt: "2026-10-12T12:00:00Z",
  },
  {
    id: "2",
    name: "Adilah",
    email: "adilah@mendaki.org.sg",
    role: "volteam",
    status: "active",
    lastSignInAt: null,
  },
  {
    id: "3",
    name: null,
    email: "ben@mendaki.org.sg",
    role: "admin",
    status: "pending_link",
    lastSignInAt: "2026-07-01T12:00:00Z",
  },
  {
    id: "4",
    name: "Nur Huda",
    email: "huda@example.com",
    role: "volunteer_leader",
    status: "active",
    lastSignInAt: "2026-10-10T12:00:00Z",
  },
];

const defaults: StaffDirectoryFilters = {
  query: "",
  role: "all",
  signIn: "all",
  sort: "name-asc",
};

const now = Date.parse("2026-10-14T00:00:00Z");
const emails = (filters: Partial<StaffDirectoryFilters>) =>
  filterStaffDirectory(accounts, { ...defaults, ...filters }, now).map(
    ({ email }) => email,
  );

describe("staff directory search, filters and sorting", () => {
  it("searches names and emails without case sensitivity", () => {
    expect(emails({ query: "ADIL" })).toEqual(["adilah@mendaki.org.sg"]);
    expect(emails({ query: "  BEN@ " })).toEqual(["ben@mendaki.org.sg"]);
  });

  it("filters by access level", () => {
    expect(emails({ role: "volunteer_leader" })).toEqual(["huda@example.com"]);
  });

  it("distinguishes never, recent and older sign-in activity", () => {
    expect(emails({ signIn: "never" })).toEqual(["adilah@mendaki.org.sg"]);
    expect(emails({ signIn: "recent" })).toEqual([
      "huda@example.com",
      "zara@mendaki.org.sg",
    ]);
    expect(emails({ signIn: "older" })).toEqual(["ben@mendaki.org.sg"]);
  });

  it("sorts names, with email as the fallback for unnamed staff", () => {
    expect(emails({ sort: "name-asc" })).toEqual([
      "adilah@mendaki.org.sg",
      "ben@mendaki.org.sg",
      "huda@example.com",
      "zara@mendaki.org.sg",
    ]);
    expect(emails({ sort: "name-desc" })[0]).toBe("zara@mendaki.org.sg");
  });

  it("sorts sign-ins newest and oldest, always placing never last", () => {
    expect(emails({ sort: "recent" })).toEqual([
      "zara@mendaki.org.sg",
      "huda@example.com",
      "ben@mendaki.org.sg",
      "adilah@mendaki.org.sg",
    ]);
    expect(emails({ sort: "oldest" })).toEqual([
      "ben@mendaki.org.sg",
      "huda@example.com",
      "zara@mendaki.org.sg",
      "adilah@mendaki.org.sg",
    ]);
  });

  it("sorts role tiers by permission order and combines filters", () => {
    expect(emails({ sort: "role-desc" })).toEqual([
      "ben@mendaki.org.sg",
      "adilah@mendaki.org.sg",
      "zara@mendaki.org.sg",
      "huda@example.com",
    ]);
    expect(
      emails({ query: "@mendaki", role: "staff", signIn: "recent" }),
    ).toEqual(["zara@mendaki.org.sg"]);
  });
});
