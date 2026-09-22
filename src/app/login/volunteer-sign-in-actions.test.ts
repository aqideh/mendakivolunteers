import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  getPublicConfigMock,
  isAuthSignUpAllowedMock,
  signInWithOtpMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getPublicConfigMock: vi.fn(),
  isAuthSignUpAllowedMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/env", () => ({
  getPublicConfig: getPublicConfigMock,
  isAuthSignUpAllowed: isAuthSignUpAllowedMock,
}));

import * as volunteerSignInActions from "@/app/login/volunteer-sign-in-actions";

function formData(email: string, next = "/dashboard") {
  const data = new FormData();
  data.set("email", email);
  data.set("next", next);
  return data;
}

describe("volunteer email sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({
      auth: { signInWithOtp: signInWithOtpMock },
    });
    getPublicConfigMock.mockReturnValue({
      appUrl: "https://mendakivolunteers.vercel.app",
    });
    isAuthSignUpAllowedMock.mockReturnValue(true);
    signInWithOtpMock.mockResolvedValue({ error: null });
  });

  it("only exposes the async server action at runtime", () => {
    expect(Object.keys(volunteerSignInActions)).toEqual([
      "requestVolunteerSignInLink",
    ]);
    expect(
      volunteerSignInActions.requestVolunteerSignInLink.constructor.name,
    ).toBe("AsyncFunction");
  });

  it("normalizes email and creates KELUARGA accounts when signup is enabled", async () => {
    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData(" New.Volunteer@Example.Test ", "/opportunities/community-day"),
    );

    expect(result.status).toBe("success");
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "new.volunteer@example.test",
      options: {
        shouldCreateUser: true,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm?next=%2Fopportunities%2Fcommunity-day",
      },
    });
  });

  it("still signs in existing accounts without provisioning when signup is disabled", async () => {
    isAuthSignUpAllowedMock.mockReturnValue(false);

    await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("existing@example.test"),
    );

    expect(signInWithOtpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "existing@example.test",
        options: expect.objectContaining({ shouldCreateUser: false }),
      }),
    );
  });

  it("rejects unsafe return destinations", async () => {
    await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("volunteer@example.test", "https://attacker.example/path"),
    );

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "volunteer@example.test",
      options: expect.objectContaining({
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm?next=%2Fdashboard",
      }),
    });
  });

  it("rejects an invalid email before calling Supabase", async () => {
    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("not-an-email"),
    );

    expect(result).toEqual({
      status: "error",
      message: "Enter a valid email address.",
    });
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it("keeps delivery failures non-disclosing while retaining diagnostics", async () => {
    signInWithOtpMock.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("volunteer@example.test"),
    );

    expect(result.status).toBe("success");
    expect(result.message).toContain("If the email can receive messages");
    expect(result.message).not.toContain("volunteer@example.test");
    expect(consoleError).toHaveBeenCalledWith(
      "Volunteer magic-link request was not delivered",
      expect.objectContaining({
        code: "over_email_send_rate_limit",
        status: 429,
      }),
    );
  });

  it("reports missing environment configuration without attempting delivery", async () => {
    isAuthSignUpAllowedMock.mockImplementation(() => {
      throw new Error("AUTH_ALLOW_SIGN_UP missing");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("volunteer@example.test"),
    );

    expect(result).toEqual({
      status: "error",
      message: "Volunteer sign-in is not configured in this environment.",
    });
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });
});
