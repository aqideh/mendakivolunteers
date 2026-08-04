import { describe, expect, it } from "vitest";

import { buildDirectionsLinks } from "./directions";

describe("volunteer directions links", () => {
  it("encodes one exact destination for Apple Maps and Google Maps", () => {
    expect(
      buildDirectionsLinks(
        "Fernvale Community Club, 21 Sengkang West Avenue #01-01, Singapore 797650",
      ),
    ).toEqual({
      appleMaps:
        "https://maps.apple.com/?daddr=Fernvale%20Community%20Club%2C%2021%20Sengkang%20West%20Avenue%20%2301-01%2C%20Singapore%20797650",
      googleMaps:
        "https://www.google.com/maps/dir/?api=1&destination=Fernvale%20Community%20Club%2C%2021%20Sengkang%20West%20Avenue%20%2301-01%2C%20Singapore%20797650",
    });
  });

  it("rejects an empty destination", () => {
    expect(() => buildDirectionsLinks("   ")).toThrow(
      "A navigation destination is required.",
    );
  });
});
