import { describe, expect, it } from "vitest";

import {
  getAppEnvironment,
  getPublicConfig,
  getRegistrationAllowedHosts,
  isAuthSignUpAllowed,
} from "@/lib/env";

describe("runtime environment configuration", () => {
  it("requires an explicit application environment", () => {
    expect(() => getAppEnvironment({ NODE_ENV: "development" })).toThrow();
  });

  it("requires an explicit sign-up policy", () => {
    expect(() => isAuthSignUpAllowed({})).toThrow();
  });

  it("parses an explicit sign-up policy", () => {
    expect(isAuthSignUpAllowed({ AUTH_ALLOW_SIGN_UP: "false" })).toBe(false);
  });

  it("uses the canonical staging URL for staging auth callbacks", () => {
    expect(
      getPublicConfig({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "staging",
        VERCEL_BRANCH_URL:
          "mendakivolunteers-git-staging-mendakivolunteers.vercel.app",
        VERCEL_URL: "mendakivolunteers-unique-deployment.vercel.app",
        NEXT_PUBLIC_SUPABASE_URL: "https://nbnglontqrxywppmmhfm.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      }).appUrl,
    ).toBe("https://keluargastaging.vercel.app");
  });

  it("keeps feature previews on their stable Vercel branch URL", () => {
    expect(
      getPublicConfig({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "feat/mobile-auth-test",
        VERCEL_BRANCH_URL:
          "mendakivolunteers-git-feat-mobile-auth-test-mendakivolunteers.vercel.app",
        VERCEL_URL: "mendakivolunteers-unique-deployment.vercel.app",
        NEXT_PUBLIC_SUPABASE_URL: "https://nbnglontqrxywppmmhfm.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      }).appUrl,
    ).toBe(
      "https://mendakivolunteers-git-feat-mobile-auth-test-mendakivolunteers.vercel.app",
    );
  });

  it("always uses the canonical MENDAKI domain for production auth callbacks", () => {
    expect(
      getPublicConfig({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "mendakivolunteers.vercel.app",
        VERCEL_URL: "mendakivolunteers-production-deployment.vercel.app",
        NEXT_PUBLIC_SUPABASE_URL: "https://glpdougaxlgaipqlzcbq.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      }).appUrl,
    ).toBe("https://keluarga.mendaki.org.sg");
  });

  it("parses and normalizes unique registration hosts", () => {
    expect(
      getRegistrationAllowedHosts({
        YMHUB_REGISTRATION_ALLOWED_HOSTS: "Register.Example.SG,events.example.sg",
      }),
    ).toEqual(["register.example.sg", "events.example.sg"]);
  });

  it("rejects registration hosts containing URL syntax", () => {
    expect(() =>
      getRegistrationAllowedHosts({
        YMHUB_REGISTRATION_ALLOWED_HOSTS: "https://register.example.sg/path",
      }),
    ).toThrow("plain DNS hostnames");
  });
});
