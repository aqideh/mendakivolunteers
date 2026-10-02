import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(() => ({})),
}));

import { createBrowserClient } from "@supabase/ssr";

import { createAuthCallbackClient, createClient } from "./client";

const mockedCreateBrowserClient = vi.mocked(createBrowserClient);

describe("Supabase browser clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  });

  it("keeps the normal browser client on default session detection", () => {
    createClient();

    expect(mockedCreateBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-publishable-key",
    );
  });

  it("prevents automatic URL processing on the auth callback client", () => {
    createAuthCallbackClient();

    expect(mockedCreateBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-publishable-key",
      {
        isSingleton: false,
        auth: {
          detectSessionInUrl: false,
        },
      },
    );
  });
});
