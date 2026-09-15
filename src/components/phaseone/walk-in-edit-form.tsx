import { updateWalkInVolunteer } from "@/app/admin/events/[id]/attendance/walk-in-actions";

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
      <form action={updateWalkInVolunteer} className="phaseone-walk-in-edit-form">
        <input name="eventId" type="hidden" value={eventId} />
        <input name="rosterId" type="hidden" value={rosterId} />
        <input name="timeslotId" type="hidden" value={timeslotId} />
        <div className="phaseone-walk-in-edit-grid">
          <div className="form-field">
            <label htmlFor={`walk-in-edit-name-${rosterId}`}>Name</label>
            <input
              id={`walk-in-edit-name-${rosterId}`}
              name="volunteerName"
              maxLength={200}
              defaultValue={volunteerName}
              autoComplete="name"
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor={`walk-in-edit-mobile-${rosterId}`}>Contact number</label>
            <input
              id={`walk-in-edit-mobile-${rosterId}`}
              name="mobile"
              maxLength={50}
              defaultValue={mobile ?? ""}
              autoComplete="tel"
              inputMode="tel"
            />
          </div>
          <div className="form-field">
            <label htmlFor={`walk-in-edit-email-${rosterId}`}>Email</label>
            <input
              id={`walk-in-edit-email-${rosterId}`}
              name="email"
              maxLength={320}
              type="email"
              defaultValue={email ?? ""}
              autoComplete="email"
            />
          </div>
        </div>
        <p className="muted">Corrections apply to this walk-in volunteer across linked shifts in the same event.</p>
        <button className="button button-secondary" type="submit">Save corrected details</button>
      </form>
    </details>
  );
}
