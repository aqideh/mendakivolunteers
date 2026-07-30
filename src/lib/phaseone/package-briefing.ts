export type BriefingAccessInput = Readonly<{
  isPublished: boolean;
  briefingUrl: string | null;
  briefingAvailableAt: string | null;
  now?: Date;
}>;

export type BriefingAccessDecision =
  | Readonly<{ available: true; destination: string }>
  | Readonly<{
      available: false;
      reason: "unpublished" | "not_configured" | "not_started" | "invalid_destination";
    }>;

export function evaluateBriefingAccess({
  isPublished,
  briefingUrl,
  briefingAvailableAt,
  now = new Date(),
}: BriefingAccessInput): BriefingAccessDecision {
  if (!isPublished) {
    return { available: false, reason: "unpublished" };
  }
  if (!briefingUrl || !briefingAvailableAt) {
    return { available: false, reason: "not_configured" };
  }

  const availableAt = new Date(briefingAvailableAt);
  if (Number.isNaN(availableAt.getTime()) || availableAt.getTime() > now.getTime()) {
    return { available: false, reason: "not_started" };
  }

  try {
    const destination = new URL(briefingUrl);
    if (destination.protocol !== "https:") {
      return { available: false, reason: "invalid_destination" };
    }
    return { available: true, destination: destination.toString() };
  } catch {
    return { available: false, reason: "invalid_destination" };
  }
}
