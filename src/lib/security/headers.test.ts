import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "@/lib/security/headers";

describe("buildContentSecurityPolicy", () => {
  it("uses a nonce and the exact production Supabase origins", () => {
    const policy = buildContentSecurityPolicy({
      appEnvironment: "production",
      nonce: "abc123",
      supabaseUrl: "https://project.supabase.co",
    });

    expect(policy).toContain("'nonce-abc123'");
    expect(policy).toContain("https://project.supabase.co");
    expect(policy).toContain("wss://project.supabase.co");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("localhost");
  });

  it("permits eval only in an explicitly configured development environment", () => {
    const policy = buildContentSecurityPolicy({
      appEnvironment: "development",
      nonce: "abc123",
      supabaseUrl: "http://127.0.0.1:54321",
    });

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("http://127.0.0.1:54321");
    expect(policy).toContain("ws://127.0.0.1:54321");
  });
});
