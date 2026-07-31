import { describe, expect, it } from "vitest";

import {
  buildPasswordSetupUrl,
  generatePasswordSetupToken,
  hashPasswordSetupToken,
  isPasswordSetupToken,
} from "@/lib/auth/password-setup";

describe("staff password setup tokens", () => {
  it("generates 32-byte base64url tokens", () => {
    const first = generatePasswordSetupToken();
    const second = generatePasswordSetupToken();

    expect(first).toHaveLength(43);
    expect(isPasswordSetupToken(first)).toBe(true);
    expect(first).not.toBe(second);
  });

  it("hashes valid tokens using SHA-256", () => {
    expect(hashPasswordSetupToken("A".repeat(43))).toBe(
      "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a",
    );
  });

  it("rejects malformed tokens", () => {
    expect(isPasswordSetupToken("too-short")).toBe(false);
    expect(() => hashPasswordSetupToken("too-short")).toThrow(
      "Password setup token is invalid",
    );
  });

  it("places the raw token in the URL fragment, not the query string", () => {
    const token = "B".repeat(43);
    const url = new URL(buildPasswordSetupUrl("https://portal.example", token));

    expect(url.pathname).toBe("/set-password");
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("token")).toBe(token);
  });
});
