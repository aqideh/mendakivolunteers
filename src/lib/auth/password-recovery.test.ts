import { describe, expect, it } from "vitest";

import {
  getRecoveryLinkType,
  isValidRecoveryPassword,
} from "./password-recovery";

describe("password recovery helpers", () => {
  it("prefers the query auth type when present", () => {
    expect(getRecoveryLinkType("recovery", "magiclink")).toBe("recovery");
  });

  it("falls back to the URL fragment auth type for implicit recovery links", () => {
    expect(getRecoveryLinkType(null, "recovery")).toBe("recovery");
  });

  it("accepts passwords that satisfy the portal policy", () => {
    expect(isValidRecoveryPassword("SecurePortal9A")).toBe(true);
  });

  it("rejects passwords without the required complexity", () => {
    expect(isValidRecoveryPassword("alllowercase9")).toBe(false);
    expect(isValidRecoveryPassword("ALLUPPERCASE9")).toBe(false);
    expect(isValidRecoveryPassword("NoDigitsHereAA")).toBe(false);
    expect(isValidRecoveryPassword("Short9Aa")).toBe(false);
  });
});
