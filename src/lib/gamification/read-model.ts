export type PointEntryKind = "award" | "adjustment" | "reversal";
export type PointCalculationMethod = "flat" | "per_verified_hour";

export function formatPoints(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Point value must be finite");
  }

  return new Intl.NumberFormat("en-SG", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPointDelta(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Point delta must be finite");
  }

  const formatted = formatPoints(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

export function formatPointEntryKind(kind: PointEntryKind): string {
  switch (kind) {
    case "award":
      return "Points awarded";
    case "adjustment":
      return "Points adjusted";
    case "reversal":
      return "Points reversed";
  }
}

export function describePointRule(
  calculationMethod: PointCalculationMethod,
  pointsValue: number,
): string {
  const points = formatPoints(pointsValue);
  return calculationMethod === "flat"
    ? `${points} points for each qualifying verified activity`
    : `${points} points for each verified volunteer hour`;
}
