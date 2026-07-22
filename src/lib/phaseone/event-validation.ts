import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  z.string().url().nullable(),
);

const optionalDateTime = z.preprocess((value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}, z.string().datetime().nullable());

export const eventFormSchema = z.object({
  id: z.string().uuid().optional(),
  externalOpportunityId: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().uuid().nullable(),
  ),
  title: z.string().trim().min(3).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  reportingAt: optionalDateTime,
  venue: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(240).nullable(),
  ),
  briefingUrl: optionalUrl,
  whatsappUrl: optionalUrl,
  signInUrl: optionalUrl,
  signOutUrl: optionalUrl,
  pin: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().regex(/^\d{4,8}$/).nullable(),
  ),
  clearPin: z.boolean(),
  isPublished: z.boolean(),
});

export type EventFormInput = z.infer<typeof eventFormSchema>;

export function parseEventForm(formData: FormData) {
  return eventFormSchema.safeParse({
    id: formData.get("id") || undefined,
    externalOpportunityId: formData.get("externalOpportunityId"),
    title: formData.get("title"),
    slug: formData.get("slug"),
    reportingAt: formData.get("reportingAt"),
    venue: formData.get("venue"),
    briefingUrl: formData.get("briefingUrl"),
    whatsappUrl: formData.get("whatsappUrl"),
    signInUrl: formData.get("signInUrl"),
    signOutUrl: formData.get("signOutUrl"),
    pin: formData.get("pin"),
    clearPin: formData.get("clearPin") === "on",
    isPublished: formData.get("isPublished") === "on",
  });
}

export const rosterRowSchema = z.object({
  volunteer_key: z.string().trim().min(1).max(120),
  volunteer_name: z.string().trim().min(1).max(200),
  email: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().email().nullable(),
  ),
  mobile: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(40).nullable(),
  ),
});

export const rosterImportSchema = z.object({
  eventId: z.string().uuid(),
  mode: z.enum(["merge", "replace"]),
  fileName: z.string().trim().min(1).max(255),
  rows: z.array(rosterRowSchema).min(1).max(2000),
}).superRefine(({ rows }, context) => {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const key = row.volunteer_key.toLowerCase();
    if (seen.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["rows", index, "volunteer_key"],
        message: `Duplicate volunteer ID: ${row.volunteer_key}`,
      });
    }
    seen.add(key);
  });
});

export function getPhaseOneValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the submitted information.";
}
