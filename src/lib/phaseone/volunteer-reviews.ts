export const positiveBehaviorOptions = [
  { value: "proactive", label: "Proactive" },
  { value: "punctual", label: "Punctual" },
  { value: "reliable", label: "Reliable" },
  { value: "good_teamwork", label: "Good teamwork" },
  { value: "engaged", label: "Engaged" },
  { value: "takes_initiative", label: "Takes initiative" },
  { value: "communicates_well", label: "Communicates well" },
  { value: "good_with_participants", label: "Good with participants" },
  { value: "follows_instructions", label: "Follows instructions" },
  { value: "leadership", label: "Leadership" },
  { value: "safety_conscious", label: "Safety-conscious" },
] as const;

export const concernBehaviorOptions = [
  { value: "late", label: "Late" },
  { value: "unreliable", label: "Reliability concern" },
  { value: "disengaged", label: "Disengaged" },
  { value: "teamwork_concern", label: "Teamwork concern" },
  { value: "did_not_follow_instructions", label: "Did not follow instructions" },
  { value: "inappropriate_conduct", label: "Inappropriate conduct" },
  { value: "safety_concern", label: "Safety / compliance concern" },
  { value: "communication_concern", label: "Communication concern" },
  { value: "participant_interaction_concern", label: "Participant interaction concern" },
] as const;

export const positiveBehaviorValues = positiveBehaviorOptions.map((option) => option.value);
export const concernBehaviorValues = concernBehaviorOptions.map((option) => option.value);

export const positiveBehaviorLabel = Object.fromEntries(
  positiveBehaviorOptions.map((option) => [option.value, option.label]),
) as Record<string, string>;

export const concernBehaviorLabel = Object.fromEntries(
  concernBehaviorOptions.map((option) => [option.value, option.label]),
) as Record<string, string>;

export function starRating(rating: number): string {
  const safeRating = Math.max(0, Math.min(5, Math.round(rating)));
  return `${"★".repeat(safeRating)}${"☆".repeat(5 - safeRating)}`;
}
