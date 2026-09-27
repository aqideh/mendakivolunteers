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

const optionalAge = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && !value.trim()) return null;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return value;
}, z.number().int("Age must be a whole number.").min(0).max(120).nullable());

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

const optionalInteger = z.preprocess(
  (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    return Number(value);
  },
  z.number().int().min(0).max(9999).nullable(),
);

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
    registrationCapacity: z.number().int().min(1).max(10000).nullable().default(null),
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
    title: z.string().trim().min(3).max(160),
    opportunitySummary: optionalText(500),
    opportunityDescription: optionalText(6000),
    opportunityImageUrl: optionalUrl,
    opportunityCategory: optionalText(120),
    opportunityEligibility: optionalText(2000),
    registrationDeadline: optionalSingaporeDateTime,
    opportunitySortOrder: optionalInteger,
    isOpportunityPublished: z.boolean(),
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
  .superRefine(({ timeslots, isOpportunityPublished, opportunitySummary }, context) => {
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

    if (isOpportunityPublished && !opportunitySummary) {
      context.addIssue({
        code: "custom",
        path: ["opportunitySummary"],
        message: "Add a short opportunity summary before publishing it.",
      });
    }

    if (
      isOpportunityPublished &&
      !timeslots.some((timeslot) => timeslot.status === "scheduled")
    ) {
      context.addIssue({
        code: "custom",
        path: ["timeslots"],
        message: "A published opportunity needs at least one scheduled shift.",
      });
    }
  });

export type EventFormInput = z.infer<typeof eventFormSchema>;

function programmeSlug(value: FormDataEntryValue | null, title: FormDataEntryValue | null) {
  const explicit = typeof value === "string" ? value.trim() : "";
  if (explicit) return explicit;
  const source = typeof title === "string" ? title : "";
  return source
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function parseEventForm(formData: FormData) {
  let timeslots: unknown = null;
  try {
    timeslots = JSON.parse(String(formData.get("timeslotsJson") ?? "null"));
  } catch {
    timeslots = null;
  }

  return eventFormSchema.safeParse({
    id: formData.get("id") || undefined,
    title: formData.get("title"),
    opportunitySummary: formData.get("opportunitySummary"),
    opportunityDescription: formData.get("opportunityDescription"),
    opportunityImageUrl: formData.get("opportunityImageUrl"),
    opportunityCategory: formData.get("opportunityCategory"),
    opportunityEligibility: formData.get("opportunityEligibility"),
    registrationDeadline: formData.get("registrationDeadline"),
    opportunitySortOrder: formData.get("opportunitySortOrder"),
    isOpportunityPublished: formData.get("isOpportunityPublished") === "on",
    slug: programmeSlug(formData.get("slug"), formData.get("title")),
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
  age: optionalAge,
  tshirt_size: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(20).nullable(),
  ),
  dietary_requirements: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(500).nullable(),
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
