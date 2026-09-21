import { z } from "zod";

import {
  isValidSingaporeDateTimeLocal,
  singaporeDateTimeLocalToIso,
} from "@/lib/content/dates";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => (value === "" ? null : value));

const optionalLocalDateTime = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || isValidSingaporeDateTimeLocal(value),
    "Enter a valid Singapore date and time.",
  )
  .transform((value) =>
    value === "" ? null : singaporeDateTimeLocalToIso(value),
  );

const optionalHttpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => value === "" || /^https:\/\//i.test(value),
    "Image URL must use HTTPS.",
  )
  .transform((value) => (value === "" ? null : value));

const optionalSortOrder = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d+$/.test(value),
    "Card order must be a whole number.",
  )
  .transform((value) => (value === "" ? null : Number(value)))
  .refine(
    (value) => value === null || (value >= 0 && value <= 9999),
    "Card order must be between 0 and 9999.",
  );

export const opportunityOverrideSchema = z
  .object({
    title: optionalText(140),
    summary: optionalText(400),
    imageUrl: optionalHttpsUrl,
    startsAt: optionalLocalDateTime,
    endsAt: optionalLocalDateTime,
    scheduleText: optionalText(100),
    venue: optionalText(180),
    isVisible: z.boolean(),
    sortOrder: optionalSortOrder,
  })
  .superRefine((value, context) => {
    if (value.startsAt && value.endsAt && value.endsAt < value.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End time must not be before the start time.",
      });
    }
  });

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function parseOpportunityOverrideForm(formData: FormData) {
  return opportunityOverrideSchema.safeParse({
    title: readText(formData, "title"),
    summary: readText(formData, "summary"),
    imageUrl: readText(formData, "imageUrl"),
    startsAt: readText(formData, "startsAt"),
    endsAt: readText(formData, "endsAt"),
    scheduleText: readText(formData, "scheduleText"),
    venue: readText(formData, "venue"),
    isVisible: formData.get("isVisible") === "on",
    sortOrder: readText(formData, "sortOrder"),
  });
}
