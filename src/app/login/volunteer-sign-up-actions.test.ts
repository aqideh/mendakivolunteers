import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  getPublicConfigMock,
  signInWithOtpMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getPublicConfigMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
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

describe("community volunteer email sign-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({
      auth: { signInWithOtp: signInWithOtpMock },
    });
    getPublicConfigMock.mockReturnValue({
      appUrl: "https://mendakivolunteers.vercel.app",
    });
    signInWithOtpMock.mockResolvedValue({ error: null });
  });

  it("only exposes the async server action at runtime", () => {
    expect(Object.keys(volunteerSignUpActions)).toEqual([
      "requestVolunteerSignUpLink",
    ]);
    expect(
      volunteerSignUpActions.requestVolunteerSignUpLink.constructor.name,
    ).toBe("AsyncFunction");
  });

  it("creates a community volunteer account and preserves a safe return path", async () => {
    const result = await volunteerSignUpActions.requestVolunteerSignUpLink(
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
