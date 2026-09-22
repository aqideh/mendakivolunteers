import { updateVolunteerProfile } from "@/app/dashboard/profile-actions";

type ProfileEditorProps = Readonly<{
  displayName: string;
  mobile: string | null;
}>;

export function ProfileEditor({ displayName, mobile }: ProfileEditorProps) {
  return (
    <form action={updateVolunteerProfile} className="phaseone-admin-form">
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
          This is used for KELUARGA registration and event communications. Your
          login email and KELUARGA volunteer ID are managed separately.
        </span>
      </div>
      <div className="actions">
        <button className="button button-primary" type="submit">
          Save profile
        </button>
      </div>
    </form>
  );
}
