import { updateWalkInVolunteerDetails } from "@/app/admin/events/[id]/attendance/walk-in-actions";

type WalkInEditFormProps = {
  eventId: string;
  rosterId: string;
  timeslotId: string;
  volunteerName: string;
  email: string | null;
  mobile: string | null;
  dietaryRequirements: string | null;
};

export function WalkInEditForm({
  eventId,
  rosterId,
  timeslotId,
  volunteerName,
  email,
  mobile,
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
          <div className="form-field">
            <label htmlFor={`walk-in-edit-name-${rosterId}`}>Name</label>
            <input
              autoComplete="name"
              defaultValue={volunteerName}
              id={`walk-in-edit-name-${rosterId}`}
              maxLength={200}
              name="volunteerName"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor={`walk-in-edit-mobile-${rosterId}`}>Contact number</label>
            <input
              autoComplete="tel"
              defaultValue={mobile ?? ""}
              id={`walk-in-edit-mobile-${rosterId}`}
              inputMode="tel"
              maxLength={50}
              name="mobile"
            />
          </div>
          <div className="form-field">
            <label htmlFor={`walk-in-edit-email-${rosterId}`}>Email</label>
            <input
              autoComplete="email"
              defaultValue={email ?? ""}
              id={`walk-in-edit-email-${rosterId}`}
              maxLength={320}
              name="email"
              type="email"
            />
          </div>
          <div className="form-field">
            <label htmlFor={`walk-in-edit-dietary-${rosterId}`}>Meal / dietary requirements</label>
            <textarea
              defaultValue={dietaryRequirements ?? ""}
              id={`walk-in-edit-dietary-${rosterId}`}
              maxLength={500}
              name="dietaryRequirements"
              placeholder="e.g. Vegetarian; peanut allergy"
              rows={2}
            />
          </div>
        </div>
        <button className="button button-secondary" type="submit">Save corrected details</button>
        <p className="muted">The correction applies across this walk-in volunteer&apos;s shifts for the event. Attendance, insights and reviews remain linked to the same volunteer identity.</p>
      </form>
    </details>
  );
}
