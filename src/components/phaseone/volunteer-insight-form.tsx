import { addVolunteerInsight } from "@/app/admin/events/[id]/insights/actions";
import { KButton, KNativeSelect, KTextarea, KTextInput } from "@/components/ui/keluarga-ui";

type VolunteerInsightFormProps = {
  eventId: string;
  rosterId: string;
  timeslotId?: string | null;
  defaultCategory?: "skill" | "interest" | "experience" | "connection" | "role_preference" | "availability" | "language" | "development" | "follow_up" | "note";
  compact?: boolean;
};

const categoryOptions = [
  { value: "interest", label: "Interest" },
  { value: "skill", label: "Skill" },
  { value: "experience", label: "Experience" },
  { value: "connection", label: "Connection / affiliation" },
  { value: "role_preference", label: "Role preference" },
  { value: "availability", label: "Availability" },
  { value: "language", label: "Language" },
  { value: "development", label: "Development interest" },
  { value: "follow_up", label: "Follow-up" },
  { value: "note", label: "Other useful note" },
];

const sourceOptions = [
  { value: "volunteer_shared", label: "Volunteer told me" },
  { value: "staff_observed", label: "Staff observed" },
];

export function VolunteerInsightForm({
  eventId,
  rosterId,
  timeslotId,
  defaultCategory = "interest",
  compact = false,
}: VolunteerInsightFormProps) {
  return (
    <form action={addVolunteerInsight} className={`insight-capture-form${compact ? " phaseone-inline-insight-form" : ""}`}>
      <input name="eventId" type="hidden" value={eventId} />
      <input name="rosterId" type="hidden" value={rosterId} />
      {timeslotId ? <input name="timeslotId" type="hidden" value={timeslotId} /> : null}
      <div className="insight-capture-grid">
        <KNativeSelect
          data={categoryOptions}
          defaultValue={defaultCategory}
          label="What did you learn?"
          name="category"
        />
        <KNativeSelect
          data={sourceOptions}
          defaultValue="volunteer_shared"
          label="Source"
          name="sourceType"
        />
      </div>
      <KTextInput
        label="Insight"
        maxLength={240}
        name="value"
        placeholder="e.g. Interested in mentoring, photography, weekends"
        required
      />
      <KTextarea
        label={<>Context <span className="muted">optional</span></>}
        maxLength={1500}
        name="detail"
        placeholder="Short factual context that will help someone understand this later"
        rows={2}
      />
      <KButton type="submit">Save insight</KButton>
    </form>
  );
}
