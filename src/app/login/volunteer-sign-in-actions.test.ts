import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  getPhaseOneAdminClientMock,
  getPublicConfigMock,
  officialLimitMock,
  rosterMaybeSingleMock,
  signInWithOtpMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getPhaseOneAdminClientMock: vi.fn(),
  getPublicConfigMock: vi.fn(),
  officialLimitMock: vi.fn(),
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

    const officialQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: officialLimitMock,
    };
    officialQuery.select.mockReturnValue(officialQuery);
    officialQuery.eq.mockReturnValue(officialQuery);

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
      schema: vi.fn(() => ({ from: vi.fn(() => officialQuery) })),
      from: vi.fn(() => rosterQuery),
    });

    signInWithOtpMock.mockResolvedValue({ error: null });
    officialLimitMock.mockResolvedValue({ data: [], error: null });
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

  it("lets an existing account request a link without creating another user", async () => {
    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData(" Existing.Volunteer@Example.Test ", "/points"),
    );

    expect(result.status).toBe("success");
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "existing.volunteer@example.test",
      options: {
        shouldCreateUser: false,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm?next=%2Fpoints",
      },
    });
  });

  it("creates an account for exactly one approved YM Hub volunteer match", async () => {
    officialLimitMock.mockResolvedValue({
      data: [{ display_name: "Official Volunteer" }],
      error: null,
    });

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("official@example.test", "/dashboard"),
    );

    expect(result.status).toBe("success");
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "official@example.test",
      options: {
        shouldCreateUser: true,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm?next=%2Fdashboard",
        data: { full_name: "Official Volunteer" },
      },
    });
  });

  it("creates an account for a rostered email during the transition", async () => {
    rosterMaybeSingleMock.mockResolvedValue({
      data: { volunteer_name: "Rostered Volunteer" },
      error: null,
    });

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("rostered@example.test", "/journey"),
    );

    expect(result.status).toBe("success");
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "rostered@example.test",
      options: {
        shouldCreateUser: true,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm?next=%2Fjourney",
        data: { full_name: "Rostered Volunteer" },
      },
    });
  });

  it("does not provision an ambiguous official-email match", async () => {
    officialLimitMock.mockResolvedValue({
      data: [
        { display_name: "First Volunteer" },
        { display_name: "Second Volunteer" },
      ],
      error: null,
    });

    await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("shared@example.test"),
    );

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "shared@example.test",
      options: {
        shouldCreateUser: false,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm?next=%2Fdashboard",
      },
    });
  });

  it("does not reveal that an unknown address is ineligible", async () => {
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
    expect(result.message).not.toContain("unknown@example.test");
  });

  it("rejects unsafe return destinations", async () => {
    await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("existing@example.test", "https://attacker.example/path"),
    );

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "existing@example.test",
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
    officialLimitMock.mockResolvedValue({
      data: [{ display_name: "Official Volunteer" }],
      error: null,
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("official@example.test"),
    );

    expect(result.status).toBe("success");
    expect(consoleError).toHaveBeenCalledWith(
      "Volunteer magic-link request was not delivered",
      expect.objectContaining({
        code: "over_email_send_rate_limit",
        officialEligible: true,
      }),
    );
  });

  it("reports an eligibility lookup failure without exposing membership", async () => {
    officialLimitMock.mockResolvedValue({
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
