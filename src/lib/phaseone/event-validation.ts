import { z } from "zod";

import {
  isValidSingaporeDateTimeLocal,
  singaporeDateTimeLocalToIso,
} from "@/lib/content/dates";

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === "https:", "Use an HTTPS URL.")
    .nullable(),
);

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(maximum).nullable(),
  );

const requiredSingaporeDateTime = z.preprocess((value) => {
  if (typeof value !== "string" || !value.trim()) return value;
  return isValidSingaporeDateTimeLocal(value)
    ? singaporeDateTimeLocalToIso(value)
    : value;
}, z.string().datetime({ message: "Enter a valid date and time." }));

const optionalSingaporeDateTime = z.preprocess((value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  return isValidSingaporeDateTimeLocal(value)
    ? singaporeDateTimeLocalToIso(value)
    : value;
}, z.string().datetime().nullable());

const optionalPin = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  z.string().regex(/^\d{4,8}$/, "PINs must contain 4 to 8 digits.").nullable(),
);

export const eventTimeslotSchema = z
  .object({
    id: z.string().uuid().optional(),
    label: optionalText(120),
    startsAt: requiredSingaporeDateTime,
    endsAt: optionalSingaporeDateTime,
    status: z.enum(["scheduled", "cancelled"]),
  })
  .superRefine((timeslot, context) => {
    if (timeslot.endsAt && timeslot.endsAt <= timeslot.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "A timeslot end must be after its start.",
      });
    }
  });

export const eventFormSchema = z
  .object({
    id: z.string().uuid().optional(),
    externalOpportunityId: z.preprocess(
      (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
      z.string().uuid().nullable(),
    ),
    title: z.string().trim().min(3).max(160),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    timeslots: z.array(eventTimeslotSchema).min(1, "Add at least one timeslot.").max(100),
    venue: optionalText(240),
    navigationDestination: optionalText(500),
    attireNotes: z.string().trim().min(1).max(500),
    preparationNotes: optionalText(2000),
    programmeRundownUrl: optionalUrl,
    briefingUrl: optionalUrl,
    briefingAvailableAt: optionalSingaporeDateTime,
    whatsappUrl: optionalUrl,
    signInUrl: optionalUrl,
    signOutUrl: optionalUrl,
    signInPin: optionalPin,
    clearSignInPin: z.boolean(),
    signOutPin: optionalPin,
    clearSignOutPin: z.boolean(),
    isPublished: z.boolean(),
  })
  .superRefine(({ timeslots }, context) => {
    const seen = new Set<string>();
    timeslots.forEach((timeslot, index) => {
      const key = `${timeslot.startsAt}|${timeslot.endsAt ?? ""}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["timeslots", index],
          message: "Remove duplicate timeslots.",
        });
      }
      seen.add(key);
    });
  });

export type EventFormInput = z.infer<typeof eventFormSchema>;

export function parseEventForm(formData: FormData) {
  let timeslots: unknown = null;
  try {
    timeslots = JSON.parse(String(formData.get("timeslotsJson") ?? "null"));
  } catch {
    timeslots = null;
  }

  return eventFormSchema.safeParse({
    id: formData.get("id") || undefined,
    externalOpportunityId: formData.get("externalOpportunityId"),
    title: formData.get("title"),
    slug: formData.get("slug"),
    timeslots,
    venue: formData.get("venue"),
    navigationDestination: formData.get("navigationDestination"),
    attireNotes:
      formData.get("attireNotes") ??
      "Wear your MENDAKI volunteer shirt if you have one.",
    preparationNotes: formData.get("preparationNotes"),
    programmeRundownUrl: formData.get("programmeRundownUrl"),
    briefingUrl: formData.get("briefingUrl"),
    briefingAvailableAt: formData.get("briefingAvailableAt"),
    whatsappUrl: formData.get("whatsappUrl"),
    signInUrl: formData.get("signInUrl"),
    signOutUrl: formData.get("signOutUrl"),
    signInPin: formData.get("signInPin"),
    clearSignInPin: formData.get("clearSignInPin") === "on",
    signOutPin: formData.get("signOutPin"),
    clearSignOutPin: formData.get("clearSignOutPin") === "on",
    isPublished: formData.get("isPublished") === "on",
  });
}

export const rosterRowSchema = z.object({
  timeslot_id: z.string().uuid(),
  volunteer_key: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(120).nullable(),
  ),
  volunteer_name: z.string().trim().min(1).max(200),
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().email().nullable(),
  ),
  mobile: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(40).nullable(),
  ),
  tshirt_size: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(20).nullable(),
  ),
});

function rosterMatchKey(row: z.infer<typeof rosterRowSchema>): string {
  if (row.volunteer_key) return `id:${row.volunteer_key.toLowerCase()}`;
  if (row.email) return `email:${row.email.toLowerCase()}`;
  if (row.mobile) return `mobile:${row.mobile.replace(/\D/g, "")}`;
  return `name:${row.volunteer_name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export const rosterImportSchema = z.object({
  eventId: z.string().uuid(),
  mode: z.enum(["merge", "replace"]),
  fileName: z.string().trim().min(1).max(255),
  rows: z.array(rosterRowSchema).min(1).max(2000),
}).superRefine(({ rows }, context) => {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = `${row.timeslot_id}|${rosterMatchKey(row)}`;
    if (seen.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["rows", index],
        message: `Duplicate volunteer in the same shift: ${row.volunteer_name}`,
      });
    }
    seen.add(key);
  });
});

export function getPhaseOneValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the submitted information.";
}
