import { describe, expect, it } from "vitest";

import { parseEventForm } from "./event-validation";

function validForm() {
  const form = new FormData();
  form.set("title", "Volunteer package");
  form.set("slug", "volunteer-package");
  form.set("reportingAt", "2026-08-10T09:30");
  form.set("briefingUrl", "https://example.com/briefing");
  form.set("briefingAvailableAt", "2026-07-28T09:30");
  form.set("signInUrl", "https://example.com/sign-in");
  form.set("signOutUrl", "https://example.com/sign-out");
  form.set("signInPin", "1234");
  form.set("signOutPin", "5678");
  return form;
}

describe("package form validation", () => {
  it("interprets date-time inputs as Singapore local time", () => {
    const parsed = parseEventForm(validForm());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.reportingAt).toBe("2026-08-10T01:30:00.000Z");
    expect(parsed.data.briefingAvailableAt).toBe("2026-07-28T01:30:00.000Z");
  });

  it("rejects non-HTTPS destinations", () => {
    const form = validForm();
    form.set("signInUrl", "http://example.com/sign-in");

    const parsed = parseEventForm(form);
    expect(parsed.success).toBe(false);
  });

  it("accepts independent PIN clear controls", () => {
    const form = validForm();
    form.delete("signInPin");
    form.set("clearSignInPin", "on");

    const parsed = parseEventForm(form);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.clearSignInPin).toBe(true);
    expect(parsed.data.clearSignOutPin).toBe(false);
  });
});
