import { describe, expect, it } from "vitest";

import { buildCanonicalStagingRedirectUrl } from "@/lib/staging-canonical-url";

describe("canonical staging redirects", () => {
  it("preserves application parameters while removing Vercel share tokens", () => {
    const redirectUrl = buildCanonicalStagingRedirectUrl(
      "https://mendakivolunteers-git-staging-mendakivolunteers.vercel.app/auth/confirm?next=%2Fdashboard&token_hash=test-token&type=email&_vercel_share=preview-secret",
      "https://keluargastaging.vercel.app",
    );

    expect(redirectUrl?.toString()).toBe(
      "https://keluargastaging.vercel.app/auth/confirm?next=%2Fdashboard&token_hash=test-token&type=email",
    );
  });

  it("preserves normal query strings", () => {
    const redirectUrl = buildCanonicalStagingRedirectUrl(
      "https://mendakivolunteers-git-staging-mendakivolunteers.vercel.app/opportunities?category=Community&date=2026-10-01",
      "https://keluargastaging.vercel.app",
    );

    expect(redirectUrl?.toString()).toBe(
      "https://keluargastaging.vercel.app/opportunities?category=Community&date=2026-10-01",
    );
  });

  it("redirects a production alias to the canonical Keluarga origin without consuming auth parameters", () => {
    const redirectUrl = buildCanonicalStagingRedirectUrl(
      "https://legacy-production.example/auth/confirm?next=%2Fdashboard&token_hash=test-token&type=email",
      "https://keluarga.mendaki.org.sg",
    );

    expect(redirectUrl?.toString()).toBe(
      "https://keluarga.mendaki.org.sg/auth/confirm?next=%2Fdashboard&token_hash=test-token&type=email",
    );
  });

  it("does not redirect requests already on the canonical staging origin", () => {
    expect(
      buildCanonicalStagingRedirectUrl(
        "https://keluargastaging.vercel.app/dashboard",
        "https://keluargastaging.vercel.app",
      ),
    ).toBeNull();
  });
});
