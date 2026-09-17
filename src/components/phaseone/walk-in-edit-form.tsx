import { updateWalkInVolunteerDetails } from "@/app/admin/events/[id]/attendance/walk-in-actions";
import { KButton, KTextarea, KTextInput } from "@/components/ui/keluarga-ui";

type WalkInEditFormProps = {
  eventId: string;
  rosterId: string;
  timeslotId: string;
  volunteerName: string;
  email: string | null;
  mobile: string | null;
  age: number | null;
  dietaryRequirements: string | null;
};

export function WalkInEditForm({
  eventId,
  rosterId,
  timeslotId,
  volunteerName,
  email,
  mobile,
  age,
  dietaryRequirements,
}: WalkInEditFormProps) {
  return (
    <details className="phaseone-walk-in-edit">
      <summary>Edit walk-in details</summary>
      <form action={updateWalkInVolunteerDetails} className="phaseone-walk-in-edit-form">
        <input name="eventId" type="hidden" value={eventId} />
        <input name="rosterId" type="hidden" value={rosterId} />
        <input name="timeslotId" type="hidden" value={timeslotId} />
        <div className="phaseone-walk-in-edit-grid">
          <KTextInput
            autoComplete="name"
            className="form-field"
            defaultValue={volunteerName}
            id={`walk-in-edit-name-${rosterId}`}
            label="Name"
            maxLength={200}
            name="volunteerName"
            required
          />
          <KTextInput
            autoComplete="tel"
            className="form-field"
            defaultValue={mobile ?? ""}
            id={`walk-in-edit-mobile-${rosterId}`}
            inputMode="tel"
            label="Contact number"
            maxLength={50}
            name="mobile"
          />
          <KTextInput
            autoComplete="email"
            className="form-field"
            defaultValue={email ?? ""}
            id={`walk-in-edit-email-${rosterId}`}
            label="Email"
            maxLength={320}
            name="email"
            type="email"
          />
          <KTextInput
            className="form-field"
            defaultValue={age ?? ""}
            id={`walk-in-edit-age-${rosterId}`}
            inputMode="numeric"
            label="Age"
            max={120}
            min={0}
            name="age"
            type="number"
          />
          <KTextarea
            className="form-field"
            defaultValue={dietaryRequirements ?? ""}
            id={`walk-in-edit-dietary-${rosterId}`}
            label="Meal / dietary requirements"
            maxLength={500}
            name="dietaryRequirements"
            placeholder="e.g. Vegetarian; peanut allergy"
            rows={2}
          />
        </div>
        <KButton type="submit" variant="light">Save corrected details</KButton>
        <p className="muted">The correction applies across this walk-in volunteer&apos;s shifts for the event. Attendance, insights and reviews remain linked to the same volunteer identity.</p>
      </form>
    </details>
  );
}
