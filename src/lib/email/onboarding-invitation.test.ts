import { describe, expect, it } from "vitest";

import { renderOnboardingInvitation } from "@/lib/email/onboarding-invitation";

const appUrl = "https://keluarga.mendaki.org.sg";
const invitationUrl = appUrl + "/onboarding/invite/open?t=example-token";

describe("onboarding invitation rendered output", () => {
  it("renders invitation subject and working activation URL, never an OTP subject", () => {
    const message = renderOnboardingInvitation({
      displayName: "Example Volunteer",
      invitationUrl,
      appUrl,
    });

    expect(message.subject).toBe("Activate your Keluarga MENDAKI volunteer profile");
    expect(message.html).toContain('href="' + invitationUrl + '"');
    expect(message.text).toContain(invitationUrl);
    expect(message.html).not.toContain("Your access code");
    expect(message.html).not.toContain("8-digit code");
  });

  it("renders for staging without a production-domain assumption", () => {
    const stagingUrl = "https://keluargastaging.vercel.app";
    const message = renderOnboardingInvitation({
      displayName: "Testing",
      invitationUrl: stagingUrl + "/onboarding/invite/open?t=staging-token",
      appUrl: stagingUrl,
    });
    expect(message.text).toContain(stagingUrl);
  });

  it("escapes display names and rejects external redirects", () => {
    const safe = renderOnboardingInvitation({
      displayName: '<script>alert("test")</script>',
      invitationUrl,
      appUrl,
    });
    expect(safe.html).not.toContain("<script>");
    expect(safe.html).toContain("&lt;script&gt;");
    expect(() => renderOnboardingInvitation({
      displayName: "Tester",
      invitationUrl: "https://other.example/onboarding/invite/open?t=token",
      appUrl,
    })).toThrow("Invalid volunteer onboarding invitation URL");
  });

  it("rejects missing tokens and extra query parameters", () => {
    for (const invalid of [
      appUrl + "/onboarding/invite/open",
      invitationUrl + "&next=https://malicious.example",
      appUrl + "/auth/confirm?t=x",
    ]) {
      expect(() => renderOnboardingInvitation({
        displayName: "Volunteer", invitationUrl: invalid, appUrl,
      })).toThrow("Invalid volunteer onboarding invitation URL");
    }
  });
});
