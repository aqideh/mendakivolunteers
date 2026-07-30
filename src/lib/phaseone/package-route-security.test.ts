import { describe, expect, it } from "vitest";

import {
  isSameOriginPackageRequest,
  packagePrivateResponseHeaders,
} from "./package-route-security";

describe("package route security", () => {
  it("accepts an exact same-origin request", () => {
    expect(
      isSameOriginPackageRequest({
        requestUrl: "https://rela.example/api/phaseone/packages/test/verify/sign-in",
        origin: "https://rela.example",
        fetchSite: "same-origin",
      }),
    ).toBe(true);
  });

  it("rejects cross-origin and malformed origins", () => {
    expect(
      isSameOriginPackageRequest({
        requestUrl: "https://rela.example/api/phaseone/packages/test/verify/sign-in",
        origin: "https://attacker.example",
        fetchSite: "cross-site",
      }),
    ).toBe(false);
    expect(
      isSameOriginPackageRequest({
        requestUrl: "https://rela.example/api/phaseone/packages/test/verify/sign-in",
        origin: "not a url",
        fetchSite: "cross-site",
      }),
    ).toBe(false);
  });

  it("allows browser navigation metadata when Origin is absent", () => {
    expect(
      isSameOriginPackageRequest({
        requestUrl: "https://rela.example/api/phaseone/packages/test/verify/sign-in",
        origin: null,
        fetchSite: "same-origin",
      }),
    ).toBe(true);
    expect(
      isSameOriginPackageRequest({
        requestUrl: "https://rela.example/api/phaseone/packages/test/verify/sign-in",
        origin: null,
        fetchSite: "none",
      }),
    ).toBe(true);
    expect(
      isSameOriginPackageRequest({
        requestUrl: "https://rela.example/api/phaseone/packages/test/verify/sign-in",
        origin: null,
        fetchSite: "cross-site",
      }),
    ).toBe(false);
  });

  it("marks private package responses as non-cacheable and non-indexable", () => {
    expect(packagePrivateResponseHeaders["Cache-Control"]).toContain("no-store");
    expect(packagePrivateResponseHeaders["Referrer-Policy"]).toBe("no-referrer");
    expect(packagePrivateResponseHeaders["X-Robots-Tag"]).toContain("noindex");
  });
});
