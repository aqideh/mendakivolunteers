import { updateVolunteerProfile } from "@/app/dashboard/profile-actions";

type ProfileEditorProps = Readonly<{
  displayName: string;
  mobile: string | null;
  bio: string | null;
  interests: string[];
  skills: string[];
  availabilityNotes: string | null;
}>;

export function ProfileEditor({
  displayName,
  mobile,
  bio,
  interests,
  skills,
  availabilityNotes,
}: ProfileEditorProps) {
  return (
    <form action={updateVolunteerProfile} className="phaseone-admin-form profile-passport-editor">
      <div className="form-field">
        <label htmlFor="profile-display-name">Full name</label>
        <input
          id="profile-display-name"
          maxLength={120}
          name="displayName"
          required
          defaultValue={displayName}
          autoComplete="name"
        />
      </div>

      <div className="form-field">
        <label htmlFor="profile-mobile">Mobile number</label>
        <input
          id="profile-mobile"
          maxLength={40}
          minLength={7}
          name="mobile"
          defaultValue={mobile ?? ""}
          inputMode="tel"
          autoComplete="tel"
        />
        <span className="form-help">
          Used for KELUARGA event communications. Your login email and volunteer ID
          are managed separately.
        </span>
      </div>

      <div className="form-field">
        <label htmlFor="profile-bio">About me</label>
        <textarea
          id="profile-bio"
          maxLength={500}
          name="bio"
          rows={4}
          defaultValue={bio ?? ""}
          placeholder="A short introduction about how you like to contribute."
        />
      </div>

      <div className="form-field">
        <label htmlFor="profile-interests">Volunteering interests</label>
        <input
          id="profile-interests"
          maxLength={720}
          name="interests"
          defaultValue={interests.join(", ")}
          placeholder="Mentoring, Youth, Community, Education"
        />
        <span className="form-help">Separate up to 12 interests with commas.</span>
      </div>

      <div className="form-field">
        <label htmlFor="profile-skills">Skills</label>
        <input
          id="profile-skills"
          maxLength={720}
          name="skills"
          defaultValue={skills.join(", ")}
          placeholder="Facilitation, Photography, Logistics"
        />
        <span className="form-help">Separate up to 12 skills with commas.</span>
      </div>

      <div className="form-field">
        <label htmlFor="profile-availability">Availability</label>
        <textarea
          id="profile-availability"
          maxLength={800}
          name="availabilityNotes"
          rows={3}
          defaultValue={availabilityNotes ?? ""}
          placeholder="Optional notes, for example: weekends and weekday evenings."
        />
      </div>

      <div className="actions">
        <button className="button button-primary" type="submit">
          Save profile
        </button>
      </div>
    </form>
  );
}
