import { z } from "zod";

import {
  isValidSingaporeDateTimeLocal,
  singaporeDateTimeLocalToIso,
} from "@/lib/content/dates";
import type { ContentStatus } from "@/types/database";

const contentStatuses = [
  "draft",
  "in_review",
  "scheduled",
  "published",
  "archived",
] as const satisfies readonly ContentStatus[];

const slugSchema = z
  .string()
  .trim()
  .min(3, "Slug must contain at least 3 characters.")
  .max(160, "Slug must contain no more than 160 characters.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and single hyphens only.",
  );

const requiredLocalDateTimeSchema = z
  .string()
  .trim()
  .refine(isValidSingaporeDateTimeLocal, "Enter a valid Singapore date and time.")
  .transform(singaporeDateTimeLocalToIso);

const optionalLocalDateTimeSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || isValidSingaporeDateTimeLocal(value),
    "Enter a valid Singapore date and time.",
  )
  .transform((value) =>
    value === "" ? null : singaporeDateTimeLocalToIso(value),
  );

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => (value === "" ? null : value));

const commonContentSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(5).max(140),
  summary: z.string().trim().min(10).max(400),
  body: z.string().trim().min(20).max(20_000),
  featured: z.boolean(),
  status: z.enum(contentStatuses),
  publishAt: optionalLocalDateTimeSchema,
  expiresAt: optionalLocalDateTimeSchema,
});

export const opportunityInputSchema = commonContentSchema
  .extend({
    category: z.string().trim().min(2).max(80),
    locationName: optionalText(180),
    isRemote: z.boolean(),
    startsAt: requiredLocalDateTimeSchema,
    endsAt: optionalLocalDateTimeSchema,
    registrationDeadline: optionalLocalDateTimeSchema,
    registrationUrl: z
      .string()
      .trim()
      .url("Enter a valid registration URL.")
      .max(2048)
      .refine((value) => value.startsWith("https://"), {
        message: "Registration links must use HTTPS.",
      }),
    ymhubActivityId: optionalText(128),
  })
  .superRefine((value, context) => {
    if (value.endsAt && value.endsAt < value.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End time must not be before the start time.",
      });
    }

    if (
      value.registrationDeadline &&
      value.registrationDeadline > value.startsAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["registrationDeadline"],
        message: "Registration deadline must not be after the start time.",
      });
    }

    if (value.status === "scheduled" && !value.publishAt) {
      context.addIssue({
        code: "custom",
        path: ["publishAt"],
        message: "Scheduled content requires a publication time.",
      });
    }

    if (value.expiresAt && value.publishAt && value.expiresAt <= value.publishAt) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Expiry must be after the publication time.",
      });
    }
  });

export const newsInputSchema = commonContentSchema.superRefine(
  (value, context) => {
    if (value.status === "scheduled" && !value.publishAt) {
      context.addIssue({
        code: "custom",
        path: ["publishAt"],
        message: "Scheduled content requires a publication time.",
      });
    }

    if (value.expiresAt && value.publishAt && value.expiresAt <= value.publishAt) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Expiry must be after the publication time.",
      });
    }
  },
);

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function parseOpportunityForm(formData: FormData) {
  return opportunityInputSchema.safeParse({
    slug: readText(formData, "slug"),
    title: readText(formData, "title"),
    summary: readText(formData, "summary"),
    body: readText(formData, "body"),
    category: readText(formData, "category"),
    locationName: readText(formData, "locationName"),
    isRemote: formData.get("isRemote") === "on",
    startsAt: readText(formData, "startsAt"),
    endsAt: readText(formData, "endsAt"),
    registrationDeadline: readText(formData, "registrationDeadline"),
    registrationUrl: readText(formData, "registrationUrl"),
    ymhubActivityId: readText(formData, "ymhubActivityId"),
    featured: formData.get("featured") === "on",
    status: readText(formData, "status"),
    publishAt: readText(formData, "publishAt"),
    expiresAt: readText(formData, "expiresAt"),
  });
}

export function parseNewsForm(formData: FormData) {
  return newsInputSchema.safeParse({
    slug: readText(formData, "slug"),
    title: readText(formData, "title"),
    summary: readText(formData, "summary"),
    body: readText(formData, "body"),
    featured: formData.get("featured") === "on",
    status: readText(formData, "status"),
    publishAt: readText(formData, "publishAt"),
    expiresAt: readText(formData, "expiresAt"),
  });
}

export function getValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Review the submitted content fields.";
}
