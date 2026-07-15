import { describe, expect, it } from "vitest";

import {
  getAppEnvironment,
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
