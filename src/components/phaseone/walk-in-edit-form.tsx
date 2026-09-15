import { updateWalkInVolunteerDetails } from "@/app/admin/events/[id]/attendance/walk-in-actions";

type WalkInEditFormProps = {
  eventId: string;
  rosterId: string;
  timeslotId: string;
  volunteerName: string;
  email: string | null;
  mobile: string | null;
};

export function WalkInEditForm({
  eventId,
  rosterId,
  timeslotId,
  volunteerName,
  email,
  mobile,
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
        </div>
        <button className="button button-secondary" type="submit">Save corrected details</button>
        <p className="muted">Use this only to fix the walk-in roster entry. Existing attendance, insights and reviews remain linked to the same event volunteer identity.</p>
      </form>
    </details>
  );
}
