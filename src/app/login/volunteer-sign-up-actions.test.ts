import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createEmailLinkClientMock,
  getPublicConfigMock,
  signInWithOtpMock,
} = vi.hoisted(() => ({
  createEmailLinkClientMock: vi.fn(),
  getPublicConfigMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
}));

vi.mock("@/lib/supabase/email-link", () => ({
  createEmailLinkClient: createEmailLinkClientMock,
}));

vi.mock("@/lib/env", () => ({
  getPublicConfig: getPublicConfigMock,
}));

import * as volunteerSignUpActions from "@/app/login/volunteer-sign-up-actions";

function formData(email: string, next = "/dashboard") {
  const data = new FormData();
  data.set("email", email);
  data.set("next", next);
  return data;
}

describe("volunteer email sign-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createEmailLinkClientMock.mockReturnValue({
      auth: {
        signInWithOtp: signInWithOtpMock,
      },
    });
    getPublicConfigMock.mockReturnValue({
      appUrl: "https://mendakivolunteers.vercel.app",
    });
    signInWithOtpMock.mockResolvedValue({ error: null });
  });

  it("only exposes the two async server actions at runtime", () => {
    expect(Object.keys(volunteerSignUpActions).sort()).toEqual([
      "requestVolunteerSignUpLink",
      "resendVolunteerVerificationLink",
    ]);
    expect(
      volunteerSignUpActions.requestVolunteerSignUpLink.constructor.name,
    ).toBe("AsyncFunction");
    expect(
      volunteerSignUpActions.resendVolunteerVerificationLink.constructor.name,
    ).toBe("AsyncFunction");
  });

  it("creates a volunteer account and preserves a safe return path", async () => {
    const result = await volunteerSignUpActions.requestVolunteerSignUpLink(
      { status: "idle", message: "" },
      formData(" New.Volunteer@Example.Test ", "/opportunities/community-day"),
    );

    expect(result.status).toBe("success");
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "new.volunteer@example.test",
      options: {
        shouldCreateUser: true,
        data: {
          email_purpose: "volunteer_signup",
        },
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm?next=%2Fopportunities%2Fcommunity-day",
      },
    });
  });

  it("resends signup verification through the same passwordless email path", async () => {
    const result =
      await volunteerSignUpActions.resendVolunteerVerificationLink(
        { status: "idle", message: "" },
        formData(" Pending.Volunteer@Example.Test ", "/profile/setup"),
      );

    expect(result.status).toBe("success");
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "pending.volunteer@example.test",
      options: {
        shouldCreateUser: true,
        data: {
          email_purpose: "volunteer_signup",
        },
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm?next=%2Fprofile%2Fsetup",
      },
    });
  });

  it("keeps resend responses generic when Supabase cannot send", async () => {
    signInWithOtpMock.mockResolvedValue({
      error: { code: "user_not_found", status: 400 },
    });

    const result =
      await volunteerSignUpActions.resendVolunteerVerificationLink(
        { status: "idle", message: "" },
        formData("unknown@example.test"),
      );

    expect(result.status).toBe("success");
    expect(result.message).not.toContain("not found");
  });

  it("surfaces email rate limiting without exposing account state", async () => {
    signInWithOtpMock.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429 },
    });

    const result =
      await volunteerSignUpActions.resendVolunteerVerificationLink(
        { status: "idle", message: "" },
        formData("pending@example.test"),
      );

    expect(result).toEqual({
      status: "error",
      message:
        "Please wait a minute before requesting another verification email.",
    });
  });

  it("rejects unsafe return destinations", async () => {
    await volunteerSignUpActions.requestVolunteerSignUpLink(
      { status: "idle", message: "" },
      formData("volunteer@example.test", "https://attacker.example/path"),
    );

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "volunteer@example.test",
      options: expect.objectContaining({
        shouldCreateUser: true,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm?next=%2Fdashboard",
      }),
    });
  });

  it("rejects an invalid email before calling Supabase", async () => {
    const result = await volunteerSignUpActions.requestVolunteerSignUpLink(
      { status: "idle", message: "" },
      formData("not-an-email"),
    );

    expect(result).toEqual({
      status: "error",
      message: "Enter a valid email address.",
    });
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });
});
