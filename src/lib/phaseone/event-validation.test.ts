import { describe, expect, it } from "vitest";

import { parseEventForm, rosterImportSchema } from "./event-validation";

function validForm() {
  const form = new FormData();
  form.set("title", "Volunteer package");
  form.set("slug", "volunteer-package");
  form.set(
    "timeslotsJson",
    JSON.stringify([
      {
        label: "Morning shift",
        startsAt: "2026-08-10T09:30",
        endsAt: "2026-08-10T12:30",
        status: "scheduled",
      },
    ]),
  );
  form.set("venue", "Test venue");
  form.set("navigationDestination", "Test venue, Singapore 123456");
  form.set("attireNotes", "Wear your MENDAKI volunteer shirt if you have one.");
  form.set("preparationNotes", "Bring a water bottle.");
  form.set("programmeRundownUrl", "https://example.com/programme-rundown.png");
  form.set("briefingUrl", "https://example.com/briefing");
  form.set("briefingAvailableAt", "2026-07-28T09:30");
  form.set("whatsappUrl", "https://chat.whatsapp.com/example");
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

    expect(parsed.data.timeslots[0]?.startsAt).toBe("2026-08-10T01:30:00.000Z");
    expect(parsed.data.timeslots[0]?.endsAt).toBe("2026-08-10T04:30:00.000Z");
    expect(parsed.data.briefingAvailableAt).toBe("2026-07-28T01:30:00.000Z");
  });

  it("trims volunteer flow fields", () => {
    const form = validForm();
    form.set("navigationDestination", "  Test venue, Singapore 123456  ");
    form.set("attireNotes", "  Wear covered shoes.  ");
    form.set("preparationNotes", "  Bring a water bottle.  ");
    form.set("programmeRundownUrl", "  https://example.com/rundown.jpg  ");

    const parsed = parseEventForm(form);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.navigationDestination).toBe("Test venue, Singapore 123456");
    expect(parsed.data.attireNotes).toBe("Wear covered shoes.");
    expect(parsed.data.preparationNotes).toBe("Bring a water bottle.");
    expect(parsed.data.programmeRundownUrl).toBe("https://example.com/rundown.jpg");
  });

  it("rejects non-HTTPS destinations", () => {
    const form = validForm();
    form.set("programmeRundownUrl", "http://example.com/rundown.png");

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

describe("shift-aware roster validation", () => {
  const eventId = "11111111-1111-4111-8111-111111111111";
  const morningId = "22222222-2222-4222-8222-222222222222";
  const afternoonId = "33333333-3333-4333-8333-333333333333";

  function row(timeslotId: string) {
    return {
      timeslot_id: timeslotId,
      volunteer_key: "VOL-001",
      volunteer_name: "Test Volunteer",
      email: "volunteer@example.com",
      mobile: "91234567",
      tshirt_size: "M",
    };
  }

  it("allows the same volunteer ID in different shifts", () => {
    const parsed = rosterImportSchema.safeParse({
      eventId,
      mode: "merge",
      fileName: "roster.csv",
      rows: [row(morningId), row(afternoonId)],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects duplicate volunteer IDs within one shift", () => {
    const parsed = rosterImportSchema.safeParse({
      eventId,
      mode: "merge",
      fileName: "roster.csv",
      rows: [row(morningId), row(morningId)],
    });

    expect(parsed.success).toBe(false);
  });

  it("normalizes optional operational fields", () => {
    const parsed = rosterImportSchema.safeParse({
      eventId,
      mode: "merge",
      fileName: "roster.csv",
      rows: [{ ...row(morningId), mobile: " 91234567 ", tshirt_size: " L " }],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.rows[0]?.mobile).toBe("91234567");
    expect(parsed.data.rows[0]?.tshirt_size).toBe("L");
  });
});
