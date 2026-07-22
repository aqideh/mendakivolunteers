import { describe, expect, it } from "vitest";

import * as loginActions from "@/app/login/actions";

describe("login server actions", () => {
  it("only exports async server actions at runtime", () => {
    expect(Object.keys(loginActions)).toEqual(["requestMagicLink"]);
    expect(loginActions.requestMagicLink.constructor.name).toBe("AsyncFunction");
  });
});
