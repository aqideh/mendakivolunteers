import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, redirectMock, signInWithPasswordMock } = vi.hoisted(
  () => ({
    createClientMock: vi.fn(),
    redirectMock: vi.fn(),
    signInWithPasswordMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import * as loginActions from "@/app/login/actions";

describe("login server actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({
      auth: {
        signInWithPassword: signInWithPasswordMock,
      },
    });
    signInWithPasswordMock.mockResolvedValue({ error: null });
  });

  it("only exports async server actions at runtime", () => {
    expect(Object.keys(loginActions)).toEqual(["signInWithPassword"]);
    expect(loginActions.signInWithPassword.constructor.name).toBe(
      "AsyncFunction",
    );
  });

  it("signs in with a normalized email and redirects to a safe path", async () => {
    const formData = new FormData();
    formData.set("email", " Aiman.Azam@MENDAKI.org.sg ");
    formData.set("password", "correct horse battery staple");
    formData.set("next", "/admin/events?status=active");

    await loginActions.signInWithPassword(
      { status: "idle", message: "" },
      formData,
    );

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "aiman.azam@mendaki.org.sg",
      password: "correct horse battery staple",
    });
    expect(redirectMock).toHaveBeenCalledWith("/admin/events?status=active");
  });

  it("does not expose account details when credentials are rejected", async () => {
    signInWithPasswordMock.mockResolvedValue({
      error: { code: "invalid_credentials", status: 400 },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const formData = new FormData();
    formData.set("email", "aiman.azam@mendaki.org.sg");
    formData.set("password", "incorrect password");

    await expect(
      loginActions.signInWithPassword(
        { status: "idle", message: "" },
        formData,
      ),
    ).resolves.toEqual({
      status: "error",
      message: "Invalid email address or password.",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe return paths", async () => {
    const formData = new FormData();
    formData.set("email", "aiman.azam@mendaki.org.sg");
    formData.set("password", "correct horse battery staple");
    formData.set("next", "https://attacker.example");

    await loginActions.signInWithPassword(
      { status: "idle", message: "" },
      formData,
    );

    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });
});
