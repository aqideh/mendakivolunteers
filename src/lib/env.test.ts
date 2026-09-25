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

  it("uses the stable Vercel branch URL for preview auth callbacks", () => {
    expect(
      getPublicConfig({
        VERCEL_ENV: "preview",
        VERCEL_BRANCH_URL:
          "mendakivolunteers-git-staging-mendakivolunteers.vercel.app",
        VERCEL_URL: "mendakivolunteers-unique-deployment.vercel.app",
        NEXT_PUBLIC_SUPABASE_URL: "https://nbnglontqrxywppmmhfm.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      }).appUrl,
    ).toBe(
      "https://mendakivolunteers-git-staging-mendakivolunteers.vercel.app",
    );
  });

  it("uses the production project URL for Vercel production auth callbacks", () => {
    expect(
      getPublicConfig({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "keluarga.mendaki.org.sg",
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
