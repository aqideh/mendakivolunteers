import { addWalkInVolunteer } from "@/app/admin/events/[id]/attendance/actions";
import { WalkInSubmitButtons } from "@/components/phaseone/attendance-quick-action";
import { KTextarea, KTextInput } from "@/components/ui/keluarga-ui";

type WalkInAddFormProps = {
  eventId: string;
  timeslotId: string;
};

export function WalkInAddForm({ eventId, timeslotId }: WalkInAddFormProps) {
  return (
    <form action={addWalkInVolunteer} className="phaseone-walk-in-form">
      <input name="eventId" type="hidden" value={eventId} />
      <input name="timeslotId" type="hidden" value={timeslotId} />
      <div className="phaseone-walk-in-grid">
        <KTextInput
          autoComplete="name"
          label="Name"
          maxLength={200}
          name="volunteerName"
          required
        />
        <KTextInput
          autoComplete="tel"
          inputMode="tel"
          label="Contact number"
          maxLength={50}
          name="mobile"
        />
        <KTextInput
          autoComplete="email"
          label="Email"
          maxLength={320}
          name="email"
          type="email"
        />
        <KTextInput
          description="Optional."
          label="Volunteer ID"
          maxLength={100}
          name="volunteerKey"
        />
        <KTextInput
          label="T-shirt size"
          maxLength={20}
          name="tshirtSize"
          placeholder="e.g. M"
        />
        <KTextarea
          label="Meal / dietary requirements"
          maxLength={500}
          name="dietaryRequirements"
          placeholder="e.g. Vegetarian; peanut allergy"
          rows={2}
        />
      </div>
      <WalkInSubmitButtons />
      <p className="muted phaseone-walk-in-note">This creates an operational event roster entry only; it does not create a portal account or official YM Hub registration.</p>
    </form>
  );
}
