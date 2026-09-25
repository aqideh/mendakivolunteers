import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  completeProfileSetup,
  saveAboutStep,
  saveAvailabilityStep,
  saveContactStep,
  saveInterestsStep,
  saveSkillsStep,
} from "@/app/profile/setup/actions";
import { PortalHeader } from "@/components/portal-header";
import { ProfilePhotoUploader } from "@/components/profile-photo-uploader";
import { requireActiveAccount } from "@/lib/auth/account-access";

export const metadata: Metadata = {
  title: "Set up your profile",
};

export const dynamic = "force-dynamic";

type SetupPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

type SetupStep =
  | "contact"
  | "interests"
  | "skills"
  | "availability"
  | "photo"
  | "about"
  | "review";

type SetupProfile = {
  avatar_path: string | null;
  bio: string | null;
  interests: string[];
  skills: string[];
  availability_notes: string | null;
  availability_slots: string[];
  preferred_commitment: string | null;
  onboarding_completed_at: string | null;
};

const steps: Array<{ key: SetupStep; label: string; required: boolean }> = [
  { key: "contact", label: "Contact details", required: true },
  { key: "interests", label: "Interests", required: true },
  { key: "skills", label: "Skills", required: true },
  { key: "availability", label: "Availability", required: true },
  { key: "photo", label: "Profile photo", required: true },
  { key: "about", label: "About you", required: false },
  { key: "review", label: "Review", required: true },
];

const availabilityOptions = [
  ["weekday_daytime", "Weekday daytime"],
  ["weekday_evening", "Weekday evenings"],
  ["saturday", "Saturdays"],
  ["sunday", "Sundays"],
  ["ad_hoc", "Ad-hoc / depends on the activity"],
] as const;

const commitmentOptions = [
  ["one_off", "One-off activities"],
  ["monthly", "About once a month"],
  ["fortnightly", "About every two weeks"],
  ["weekly", "Weekly"],
  ["flexible", "Flexible"],
] as const;

function readParameter(
  parameters: Record<string, string | string[] | undefined>,
  name: string,
) {
  const value = parameters[name];
  return Array.isArray(value) ? value[0] : value;
}

function validStep(value: string | undefined): SetupStep {
  return steps.some((step) => step.key === value)
    ? (value as SetupStep)
    : "contact";
}

function milestoneState(input: {
  displayName: string;
  mobile: string | null;
  profile: SetupProfile | null;
}) {
  const profile = input.profile;
  return {
    contact: Boolean(input.displayName.trim() && input.mobile?.trim()),
    interests: (profile?.interests?.length ?? 0) > 0,
    skills: (profile?.skills?.length ?? 0) > 0,
    availability:
      (profile?.availability_slots?.length ?? 0) > 0 &&
      Boolean(profile?.preferred_commitment),
    photo: Boolean(profile?.avatar_path),
  };
}

export default async function ProfileSetupPage({ searchParams }: SetupPageProps) {
  const { supabase, userId } = await requireActiveAccount("/profile/setup");
  const client = supabase as unknown as SupabaseClient;
  const parameters = await searchParams;
  const currentStep = validStep(readParameter(parameters, "step"));
  const error = readParameter(parameters, "error");

  const volunteerResult = await client
    .schema("core")
    .from("volunteers")
    .select("id, display_name, mobile")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (volunteerResult.error || !volunteerResult.data) {
    redirect("/dashboard?error=profile_update_failed");
  }

  const volunteer = volunteerResult.data;
  const profileResult = await client
    .from("keluarga_volunteer_profiles")
    .select(
      "avatar_path, bio, interests, skills, availability_notes, availability_slots, preferred_commitment, onboarding_completed_at",
    )
    .eq("volunteer_id", volunteer.id)
    .maybeSingle();

  if (profileResult.error) {
    throw new Error("Profile setup could not be loaded");
  }

  const profile = (profileResult.data as SetupProfile | null) ?? null;
  const milestones = milestoneState({
    displayName: volunteer.display_name ?? "",
    mobile: volunteer.mobile,
    profile,
  });
  const completeCount = Object.values(milestones).filter(Boolean).length;
  const completion = completeCount * 20;

  let avatarUrl: string | null = null;
  if (profile?.avatar_path) {
    const signedUrlResult = await client.storage
      .from("volunteer-profile-photos")
      .createSignedUrl(profile.avatar_path, 60 * 60);
    if (!signedUrlResult.error) {
      avatarUrl = signedUrlResult.data.signedUrl;
    }
  }

  const errorMessage =
    error === "validation"
      ? "Check the fields below before continuing."
      : error === "incomplete"
        ? "Complete all five profile milestones before finishing setup."
        : error
          ? "That change could not be saved. Try again."
          : null;

  const currentIndex = steps.findIndex((step) => step.key === currentStep);

  return (
    <div className="site-shell profile-setup-shell">
      <PortalHeader status="Profile setup" dashboard />

      <main className="profile-setup-layout">
        <aside className="profile-setup-progress" aria-label="Profile setup progress">
          <Link className="profile-setup-back" href="/dashboard">
            ← Back to profile
          </Link>

          <div className="profile-setup-progress-summary">
            <strong>{completion}%</strong>
            <span>profile complete</span>
          </div>

          <div
            className="profile-setup-progress-bar"
            aria-label={`${completion}% profile complete`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completion}
          >
            <span style={{ width: `${completion}%` }} />
          </div>

          <ol className="profile-setup-step-list">
            {steps.map((step, index) => {
              const milestoneComplete =
                step.key === "contact"
                  ? milestones.contact
                  : step.key === "interests"
                    ? milestones.interests
                    : step.key === "skills"
                      ? milestones.skills
                      : step.key === "availability"
                        ? milestones.availability
                        : step.key === "photo"
                          ? milestones.photo
                          : step.key === "about"
                            ? Boolean(profile?.bio)
                            : completeCount === 5;

              return (
                <li
                  key={step.key}
                  data-current={step.key === currentStep ? "true" : "false"}
                  data-complete={milestoneComplete ? "true" : "false"}
                >
                  <Link href={`/profile/setup?step=${step.key}`}>
                    <span className="profile-setup-step-marker">
                      {milestoneComplete ? "✓" : index + 1}
                    </span>
                    <span>
                      <strong>{step.label}</strong>
                      {!step.required ? <small>Optional</small> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="profile-setup-stage" aria-labelledby="profile-setup-title">
          <div className="profile-setup-stage-header">
            <p>
              Step {currentIndex + 1} of {steps.length}
            </p>
            <h1 id="profile-setup-title">
              {currentStep === "contact"
                ? "How can we reach you?"
                : currentStep === "interests"
                  ? "What are you interested in?"
                  : currentStep === "skills"
                    ? "What can you bring?"
                    : currentStep === "availability"
                      ? "When would you usually volunteer?"
                      : currentStep === "photo"
                        ? "Add a profile photo"
                        : currentStep === "about"
                          ? "Tell us a little about yourself"
                          : "Your profile is nearly ready"}
            </h1>
            <p>
              {currentStep === "contact"
                ? "Keep your contact details current so we can reach you about activities you join."
                : currentStep === "interests"
                  ? "These help us show you volunteering opportunities that are more relevant to you."
                  : currentStep === "skills"
                    ? "Share skills you are comfortable contributing or would like to use while volunteering."
                    : currentStep === "availability"
                      ? "A general indication is enough. You can change this whenever your schedule changes."
                      : currentStep === "photo"
                        ? "A clear photo helps the KELUARGA community recognise you at activities."
                        : currentStep === "about"
                          ? "This is optional. A short introduction can help others get to know you."
                          : "Check that the essentials are complete. You can update any of these details later."}
            </p>
          </div>

          {errorMessage ? (
            <div className="notice notice-error" role="alert">
              {errorMessage}
            </div>
          ) : null}

          {currentStep === "contact" ? (
            <form action={saveContactStep} className="profile-setup-form">
              <div className="form-field">
                <label htmlFor="setup-name">Full name</label>
                <input
                  id="setup-name"
                  name="displayName"
                  maxLength={120}
                  defaultValue={volunteer.display_name ?? ""}
                  autoComplete="name"
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="setup-mobile">Mobile number</label>
                <input
                  id="setup-mobile"
                  name="mobile"
                  minLength={7}
                  maxLength={40}
                  defaultValue={volunteer.mobile ?? ""}
                  autoComplete="tel"
                  inputMode="tel"
                  required
                />
              </div>
              <div className="profile-setup-actions">
                <button className="button button-primary" type="submit">
                  Save and continue
                </button>
              </div>
            </form>
          ) : null}

          {currentStep === "interests" ? (
            <form action={saveInterestsStep} className="profile-setup-form">
              <div className="form-field">
                <label htmlFor="setup-interests">Volunteering interests</label>
                <input
                  id="setup-interests"
                  name="interests"
                  defaultValue={profile?.interests?.join(", ") ?? ""}
                  placeholder="Mentoring, Youth, Community, Education"
                  required
                />
                <span className="form-help">
                  Add one or more interests, separated by commas.
                </span>
              </div>
              <div className="profile-setup-actions">
                <Link className="button button-secondary" href="/profile/setup?step=contact">
                  Back
                </Link>
                <button className="button button-primary" type="submit">
                  Save and continue
                </button>
              </div>
            </form>
          ) : null}

          {currentStep === "skills" ? (
            <form action={saveSkillsStep} className="profile-setup-form">
              <div className="form-field">
                <label htmlFor="setup-skills">Skills</label>
                <input
                  id="setup-skills"
                  name="skills"
                  defaultValue={profile?.skills?.join(", ") ?? ""}
                  placeholder="Facilitation, Photography, Logistics"
                  required
                />
                <span className="form-help">
                  Add one or more skills, separated by commas.
                </span>
              </div>
              <div className="profile-setup-actions">
                <Link className="button button-secondary" href="/profile/setup?step=interests">
                  Back
                </Link>
                <button className="button button-primary" type="submit">
                  Save and continue
                </button>
              </div>
            </form>
          ) : null}

          {currentStep === "availability" ? (
            <form action={saveAvailabilityStep} className="profile-setup-form">
              <fieldset className="profile-setup-choice-group">
                <legend>Typical availability</legend>
                {availabilityOptions.map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      name="availabilitySlots"
                      value={value}
                      defaultChecked={profile?.availability_slots?.includes(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="profile-setup-choice-group">
                <legend>Preferred commitment</legend>
                {commitmentOptions.map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="preferredCommitment"
                      value={value}
                      defaultChecked={profile?.preferred_commitment === value}
                      required
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              <div className="form-field">
                <label htmlFor="setup-availability-notes">Anything else? <span className="muted">(optional)</span></label>
                <textarea
                  id="setup-availability-notes"
                  name="availabilityNotes"
                  rows={3}
                  maxLength={800}
                  defaultValue={profile?.availability_notes ?? ""}
                  placeholder="For example: usually available after 7pm on weekdays."
                />
              </div>

              <div className="profile-setup-actions">
                <Link className="button button-secondary" href="/profile/setup?step=skills">
                  Back
                </Link>
                <button className="button button-primary" type="submit">
                  Save and continue
                </button>
              </div>
            </form>
          ) : null}

          {currentStep === "photo" ? (
            <div className="profile-setup-photo">
              <ProfilePhotoUploader
                volunteerId={volunteer.id}
                userId={userId}
                displayName={volunteer.display_name ?? "Volunteer"}
                avatarUrl={avatarUrl}
                avatarPath={profile?.avatar_path ?? null}
                completion={completion}
              />
              <p className="muted">
                Tap the photo to choose or replace your image.
              </p>
              <div className="profile-setup-actions">
                <Link className="button button-secondary" href="/profile/setup?step=availability">
                  Back
                </Link>
                <Link className="button button-primary" href="/profile/setup?step=about">
                  Continue
                </Link>
              </div>
            </div>
          ) : null}

          {currentStep === "about" ? (
            <form action={saveAboutStep} className="profile-setup-form">
              <div className="form-field">
                <label htmlFor="setup-bio">About me</label>
                <textarea
                  id="setup-bio"
                  name="bio"
                  rows={5}
                  maxLength={500}
                  defaultValue={profile?.bio ?? ""}
                  placeholder="A short introduction about how you like to contribute."
                />
              </div>
              <div className="profile-setup-actions">
                <Link className="button button-secondary" href="/profile/setup?step=photo">
                  Back
                </Link>
                <button className="button button-primary" type="submit">
                  Continue
                </button>
              </div>
            </form>
          ) : null}

          {currentStep === "review" ? (
            <div className="profile-setup-review">
              <div className="profile-setup-review-score">
                <strong>{completion}%</strong>
                <span>{completeCount} of 5 essentials complete</span>
              </div>

              <div className="profile-setup-review-list">
                {[
                  ["Contact details", milestones.contact, "contact"],
                  ["Volunteering interests", milestones.interests, "interests"],
                  ["Skills", milestones.skills, "skills"],
                  ["Availability", milestones.availability, "availability"],
                  ["Profile photo", milestones.photo, "photo"],
                ].map(([label, done, step]) => (
                  <Link key={String(step)} href={`/profile/setup?step=${step}`}>
                    <span className="profile-setup-review-check" data-complete={done ? "true" : "false"}>
                      {done ? "✓" : "○"}
                    </span>
                    <strong>{label}</strong>
                    <span aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>

              <div className="profile-setup-actions">
                <Link className="button button-secondary" href="/profile/setup?step=about">
                  Back
                </Link>
                <form action={completeProfileSetup}>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={completeCount < 5}
                  >
                    Finish profile setup
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
