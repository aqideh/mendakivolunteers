import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  createUserMock,
  deleteUserMock,
  ensureVolunteerMock,
  getAdminClientMock,
  getServerSecretMock,
  headersMock,
  redirectMock,
  signInWithPasswordMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createUserMock: vi.fn(),
  deleteUserMock: vi.fn(),
  ensureVolunteerMock: vi.fn(),
  getAdminClientMock: vi.fn(),
  getServerSecretMock: vi.fn(),
  headersMock: vi.fn(),
  redirectMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
}));

function queryResult(result: { count?: number; error?: unknown } = {}) {
  const resolved = {
    count: result.count ?? 0,
    error: result.error ?? null,
  };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    insert: vi.fn(),
    then: (
      resolve: (value: typeof resolved) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(resolved).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gte.mockResolvedValue(resolved);
  query.insert.mockReturnValue(query);
  return query;
}

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/phaseone/admin", () => ({
  getPhaseOneAdminClient: getAdminClientMock,
  getPhaseOneServerSecret: getServerSecretMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import * as volunteerSignUpActions from "@/app/login/volunteer-sign-up-actions";

function formData(
  email: string,
  password = "StrongPassword123",
  next = "/dashboard",
) {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  data.set("confirmPassword", password);
  data.set("next", next);
  return data;
}

describe("volunteer password sign-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    headersMock.mockResolvedValue({
      get: (name: string) =>
        name === "cf-connecting-ip" ? "203.0.113.10" : null,
    });
    getServerSecretMock.mockReturnValue(
      "0123456789abcdef0123456789abcdef",
    );

    getAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          createUser: createUserMock,
          deleteUser: deleteUserMock,
        },
      },
      schema: vi.fn(() => ({
        from: vi.fn(() => queryResult()),
      })),
    });

    createUserMock.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
    deleteUserMock.mockResolvedValue({ data: null, error: null });
    signInWithPasswordMock.mockResolvedValue({ error: null });
    ensureVolunteerMock.mockResolvedValue({
      data: "created_unverified",
      error: null,
    });
    createClientMock.mockResolvedValue({
      auth: { signInWithPassword: signInWithPasswordMock },
      schema: vi.fn(() => ({ rpc: ensureVolunteerMock })),
    });
  });

  it("only exports the password account action", () => {
    expect(Object.keys(volunteerSignUpActions)).toEqual([
      "createVolunteerPasswordAccount",
    ]);
  });

  it("creates an isolated unverified account and establishes a session", async () => {
    await volunteerSignUpActions.createVolunteerPasswordAccount(
      { status: "idle", message: "" },
      formData(
        " New.Volunteer@Example.Test ",
        "StrongPassword123",
        "/opportunities/community-day",
      ),
    );

    expect(createUserMock).toHaveBeenCalledWith({
      email: "new.volunteer@example.test",
      password: "StrongPassword123",
      email_confirm: true,
      app_metadata: {
        keluarga_email_ownership_verified: false,
        keluarga_signup_method: "password_without_email",
      },
    });
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "new.volunteer@example.test",
      password: "StrongPassword123",
    });
    expect(ensureVolunteerMock).toHaveBeenCalledWith(
      "ensure_current_keluarga_volunteer",
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "/opportunities/community-day",
    );
  });

  it("sends dashboard signups to profile setup", async () => {
    await volunteerSignUpActions.createVolunteerPasswordAccount(
      { status: "idle", message: "" },
      formData("volunteer@example.test"),
    );

    expect(redirectMock).toHaveBeenCalledWith("/profile/setup");
  });

  it("rejects weak or mismatched passwords before account creation", async () => {
    const weak = await volunteerSignUpActions.createVolunteerPasswordAccount(
      { status: "idle", message: "" },
      formData("volunteer@example.test", "weak"),
    );
    expect(weak.status).toBe("error");

    const mismatchData = formData("volunteer@example.test");
    mismatchData.set("confirmPassword", "DifferentPassword123");
    const mismatch =
      await volunteerSignUpActions.createVolunteerPasswordAccount(
        { status: "idle", message: "" },
        mismatchData,
      );
    expect(mismatch).toEqual({
      status: "error",
      message: "The passwords do not match.",
    });
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid email before account creation", async () => {
    const result =
      await volunteerSignUpActions.createVolunteerPasswordAccount(
        { status: "idle", message: "" },
        formData("not-an-email"),
      );

    expect(result).toEqual({
      status: "error",
      message: "Enter a valid email address.",
    });
    expect(createUserMock).not.toHaveBeenCalled();
  });
});
