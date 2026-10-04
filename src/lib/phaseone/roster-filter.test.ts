import { describe, expect, it } from "vitest";
import { matchesRosterFilter, type RosterFilter } from "./roster-filter";

const records = [
  { status: "pending", filterText: "Azmi KEL00123", needsAttention: false },
  { status: "signed_in", filterText: "Nadia KEL00124", needsAttention: true },
  { status: "signed_out", filterText: "Farhan KEL00125", needsAttention: false },
  { status: "withdrawn", filterText: "Sarah KEL00126", needsAttention: true },
  { status: "absent", filterText: "Hakim KEL00127", needsAttention: false },
  { status: "anomaly", filterText: "Mira KEL00128", needsAttention: true },
];
const defaults: RosterFilter = { query: "", status: "all", hideWithdrawn: false, hideAbsent: false };
function shown(overrides: Partial<RosterFilter> = {}) {
  return records.filter(row => matchesRosterFilter(row, { ...defaults, ...overrides })).map(row => row.status);
}
describe("roster views", () => {
  it("shows the complete roster when no filter is active", () => {
    expect(shown()).toEqual(["pending", "signed_in", "signed_out", "withdrawn", "absent", "anomaly"]);
  });
  it("hides both non-attendance groups without hiding active or anomalous records", () => {
    expect(shown({ hideWithdrawn: true, hideAbsent: true })).toEqual(["pending", "signed_in", "signed_out", "anomaly"]);
  });
  it("supports independent exclusions", () => {
    expect(shown({ hideWithdrawn: true })).toContain("absent");
    expect(shown({ hideAbsent: true })).toContain("withdrawn");
  });
  it("combines name or ID search with the selected status", () => {
    expect(shown({ query: "  kEl00124  ", status: "signed_in" })).toEqual(["signed_in"]);
    expect(shown({ query: "Nadia", status: "pending" })).toEqual([]);
  });
  it("surfaces multiple kinds of attention without treating attention as an attendance status", () => {
    expect(shown({ status: "attention" })).toEqual(["signed_in", "withdrawn", "anomaly"]);
    expect(shown({ status: "attention", hideWithdrawn: true })).toEqual(["signed_in", "anomaly"]);
  });
  it("clearing filters restores previously hidden volunteers", () => {
    expect(shown({ query: "missing", hideAbsent: true })).toEqual([]);
    expect(shown()).toHaveLength(6);
  });
});
