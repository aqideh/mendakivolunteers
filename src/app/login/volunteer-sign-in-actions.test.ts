import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  getPhaseOneAdminClientMock,
  getPublicConfigMock,
  rosterMaybeSingleMock,
  signInWithOtpMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getPhaseOneAdminClientMock: vi.fn(),
  getPublicConfigMock: vi.fn(),
  rosterMaybeSingleMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/phaseone/admin", () => ({
  getPhaseOneAdminClient: getPhaseOneAdminClientMock,
}));

vi.mock("@/lib/env", () => ({
  getPublicConfig: getPublicConfigMock,
}));

import * as volunteerSignInActions from "@/app/login/volunteer-sign-in-actions";

function formData(email: string) {
  const data = new FormData();
  data.set("email", email);
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

    const rosterQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: rosterMaybeSingleMock,
    };
    rosterQuery.select.mockReturnValue(rosterQuery);
    rosterQuery.eq.mockReturnValue(rosterQuery);
    rosterQuery.order.mockReturnValue(rosterQuery);
    rosterQuery.limit.mockReturnValue(rosterQuery);
    getPhaseOneAdminClientMock.mockReturnValue({
      from: vi.fn(() => rosterQuery),
    });

    signInWithOtpMock.mockResolvedValue({ error: null });
    rosterMaybeSingleMock.mockResolvedValue({ data: null, error: null });
  });

  it("only exposes the async server action at runtime", () => {
    expect(Object.keys(volunteerSignInActions)).toEqual([
      "requestVolunteerSignInLink",
    ]);
    expect(
      volunteerSignInActions.requestVolunteerSignInLink.constructor.name,
    ).toBe("AsyncFunction");
  });

  it("lets an existing non-rostered KELUARGA account request a link without creating a user", async () => {
    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData(" Existing.Volunteer@Example.Test "),
    );

    expect(result.status).toBe("success");
    expect(rosterMaybeSingleMock).toHaveBeenCalledOnce();
    expect(signInWithOtpMock).toHaveBeenCalledOnce();
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "existing.volunteer@example.test",
      options: {
        shouldCreateUser: false,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm",
      },
    });
  });

  it("creates a passwordless KELUARGA account for a rostered email", async () => {
    rosterMaybeSingleMock.mockResolvedValue({
      data: { volunteer_name: "Registered Volunteer" },
      error: null,
    });

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("registered@example.test"),
    );

    expect(result.status).toBe("success");
    expect(signInWithOtpMock).toHaveBeenCalledOnce();
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "registered@example.test",
      options: {
        shouldCreateUser: true,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm",
        data: { full_name: "Registered Volunteer" },
      },
    });
  });

  it("does not create an account or reveal that an unknown address is not rostered", async () => {
    signInWithOtpMock.mockResolvedValue({
      error: { code: "user_not_found", status: 400 },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("unknown@example.test"),
    );

    expect(result.status).toBe("success");
    expect(result.message).toContain("If this email is linked");
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "unknown@example.test",
      options: {
        shouldCreateUser: false,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm",
      },
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

  it("keeps delivery failures non-disclosing while retaining them in server logs", async () => {
    signInWithOtpMock.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    rosterMaybeSingleMock.mockResolvedValue({
      data: { volunteer_name: "Registered Volunteer" },
      error: null,
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("registered@example.test"),
    );

    expect(result.status).toBe("success");
    expect(result.message).not.toContain("registered@example.test");
    expect(consoleError).toHaveBeenCalledWith(
      "Volunteer magic-link request was not delivered",
      expect.objectContaining({
        code: "over_email_send_rate_limit",
        rosterEligible: true,
      }),
    );
  });

  it("reports an eligibility lookup failure without exposing roster membership", async () => {
    rosterMaybeSingleMock.mockResolvedValue({
      data: null,
      error: { code: "PGRST000" },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("volunteer@example.test"),
    );

    expect(result).toEqual({
      status: "error",
      message: "A sign-in link could not be sent right now. Try again shortly.",
    });
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });
});
