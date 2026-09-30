import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  redirectMock,
  reviewMaybeSingleMock,
  signInWithPasswordMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  redirectMock: vi.fn(),
  reviewMaybeSingleMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import * as volunteerSignInActions from "@/app/login/volunteer-sign-in-actions";

function formData(
  email: string,
  password = "StrongPassword123",
  next = "/dashboard",
) {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  data.set("next", next);
  return data;
}

function reviewQuery() {
  const query = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    maybeSingle: reviewMaybeSingleMock,
  };
  query.from.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

describe("volunteer password sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reviewMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const query = reviewQuery();
    createClientMock.mockResolvedValue({
      auth: { signInWithPassword: signInWithPasswordMock },
      schema: vi.fn(() => query),
    });
    signInWithPasswordMock.mockResolvedValue({
      data: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      error: null,
    });
  });

  it("only exports the password sign-in action", () => {
    expect(Object.keys(volunteerSignInActions)).toEqual([
      "signInVolunteerWithPassword",
    ]);
  });

  it("normalizes email and preserves a safe return path", async () => {
    await volunteerSignInActions.signInVolunteerWithPassword(
      { status: "idle", message: "" },
      formData(
        " New.Volunteer@Example.Test ",
        "StrongPassword123",
        "/opportunities/community-day",
      ),
    );

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "new.volunteer@example.test",
      password: "StrongPassword123",
    });
    expect(redirectMock).toHaveBeenCalledWith(
      "/opportunities/community-day",
    );
  });

  it("routes temporary accounts through the review prompt", async () => {
    reviewMaybeSingleMock.mockResolvedValue({
      data: { id: "22222222-2222-4222-8222-222222222222" },
      error: null,
    });

    await volunteerSignInActions.signInVolunteerWithPassword(
      { status: "idle", message: "" },
      formData(
        "volunteer@example.test",
        "StrongPassword123",
        "/opportunities/community-day",
      ),
    );

    expect(redirectMock).toHaveBeenCalledWith(
      "/account/review?next=%2Fopportunities%2Fcommunity-day",
    );
  });

  it("returns a generic error for rejected credentials", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", status: 400 },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await volunteerSignInActions.signInVolunteerWithPassword(
      { status: "idle", message: "" },
      formData("volunteer@example.test", "WrongPassword123"),
    );

    expect(result).toEqual({
      status: "error",
      message: "Invalid email address or password.",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe return paths", async () => {
    await volunteerSignInActions.signInVolunteerWithPassword(
      { status: "idle", message: "" },
      formData(
        "volunteer@example.test",
        "StrongPassword123",
        "https://attacker.example",
      ),
    );

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects invalid input without calling Supabase", async () => {
    const result = await volunteerSignInActions.signInVolunteerWithPassword(
      { status: "idle", message: "" },
      formData("not-an-email"),
    );

    expect(result).toEqual({
      status: "error",
      message: "Enter a valid email address.",
    });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });
});
