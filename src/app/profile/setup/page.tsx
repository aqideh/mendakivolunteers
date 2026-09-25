import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  completeProfileSetup,
  saveAboutStep,
  saveAvailabilityStep,
  saveContactStep,
  saveEducationStep,
  saveEventReadinessStep,
  saveHomeStep,
  saveInterestsStep,
  savePersonalStep,
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
  | "home"
  | "personal"
  | "interests"
  | "skills"
  | "availability"
  | "event-readiness"
  | "education"
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

type PrivateDetails = {
  date_of_birth: string | null;
  postal_code: string | null;
  address_line: string | null;
  neighbourhood: string | null;
  planning_area: string | null;
  electoral_division: string | null;
  dietary_requirements: string | null;
  food_allergies: string | null;
  no_known_food_allergies: boolean;
  tshirt_size: string | null;
  highest_qualification: string | null;
  institution: string | null;
  field_of_study: string | null;
  languages_spoken: string[];
  emergency_contact_name: string | null;
  emergency_contact_mobile: string | null;
};

const steps: Array<{ key: SetupStep; label: string; required: boolean }> = [
  { key: "contact", label: "Contact details", required: true },
  { key: "home", label: "Home area", required: true },
  { key: "personal", label: "Personal details", required: true },
  { key: "interests", label: "Interests", required: true },
  { key: "skills", label: "Skills", required: true },
  { key: "availability", label: "Availability", required: true },
  { key: "event-readiness", label: "Event readiness", required: true },
  { key: "education", label: "Education", required: true },
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

const shirtSizes = ["S", "M", "L", "XL", "2XL", "3XL", "5XL", "7XL"] as const;

const qualifications = [
  ["primary", "Primary"],
  ["secondary", "Secondary"],
  ["n_level", "N-Level"],
  ["o_level", "O-Level"],
  ["a_level", "A-Level"],
  ["ite", "ITE / Nitec / Higher Nitec"],
  ["diploma", "Diploma"],
  ["professional_certificate", "Professional certificate"],
  ["bachelors", "Bachelor's degree"],
  ["postgraduate", "Postgraduate"],
  ["other", "Other"],
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
  privateDetails: PrivateDetails | null;
}) {
  const profile = input.profile;
  const privateDetails = input.privateDetails;
  return {
    contact: Boolean(input.displayName.trim() && input.mobile?.trim()),
    home: Boolean(privateDetails?.postal_code && privateDetails?.address_line),
    personal: Boolean(privateDetails?.date_of_birth),
    interests: (profile?.interests?.length ?? 0) > 0,
    skills: (profile?.skills?.length ?? 0) > 0,
    availability:
      (profile?.availability_slots?.length ?? 0) > 0 &&
      Boolean(profile?.preferred_commitment),
    eventReadiness:
      Boolean(privateDetails?.tshirt_size) &&
      Boolean(
        privateDetails?.no_known_food_allergies ||
          privateDetails?.food_allergies?.trim(),
      ),
    education: Boolean(privateDetails?.highest_qualification),
    photo: Boolean(profile?.avatar_path),
  };
}

function modeSuffix(editMode: boolean) {
  return editMode ? "&mode=edit" : "";
}

function stepHref(step: SetupStep, editMode: boolean) {
  return `/profile/setup?step=${step}${modeSuffix(editMode)}`;
}

export default async function ProfileSetupPage({ searchParams }: SetupPageProps) {
  const { supabase, userId } = await requireActiveAccount("/profile/setup");
  const client = supabase as unknown as SupabaseClient;
  const parameters = await searchParams;
  const currentStep = validStep(readParameter(parameters, "step"));
  const error = readParameter(parameters, "error");
  const editMode = readParameter(parameters, "mode") === "edit";

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
  const [profileResult, privateResult] = await Promise.all([
    client
      .from("keluarga_volunteer_profiles")
      .select(
        "avatar_path, bio, interests, skills, availability_notes, availability_slots, preferred_commitment, onboarding_completed_at",
      )
      .eq("volunteer_id", volunteer.id)
      .maybeSingle(),
    client
      .from("volunteer_private_details")
      .select(
        "date_of_birth, postal_code, address_line, neighbourhood, planning_area, electoral_division, dietary_requirements, food_allergies, no_known_food_allergies, tshirt_size, highest_qualification, institution, field_of_study, languages_spoken, emergency_contact_name, emergency_contact_mobile",
      )
      .eq("volunteer_id", volunteer.id)
      .maybeSingle(),
  ]);

  if (profileResult.error || privateResult.error) {
    throw new Error("Profile setup could not be loaded");
  }

  const profile = (profileResult.data as SetupProfile | null) ?? null;
  const privateDetails = (privateResult.data as PrivateDetails | null) ?? null;
  const milestones = milestoneState({
    displayName: volunteer.display_name ?? "",
    mobile: volunteer.mobile,
    profile,
    privateDetails,
  });
  const completeCount = Object.values(milestones).filter(Boolean).length;
  const completion = Math.round((completeCount / 9) * 100);

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
        ? "Complete all required profile milestones before finishing setup."
        : error
          ? "That change could not be saved. Try again."
          : null;

  const currentIndex = steps.findIndex((step) => step.key === currentStep);

  return (
    <div className="site-shell profile-setup-shell">
      <PortalHeader status={editMode ? "Edit profile" : "Profile setup"} dashboard />

      <main className="profile-setup-layout">
        <aside className="profile-setup-progress" aria-label="Profile setup progress">
          <Link
            className="profile-setup-back"
            href={editMode ? "/profile/edit" : "/dashboard"}
          >
            ← {editMode ? "Back to profile details" : "Back to profile"}
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

          {!editMode ? (
            <ol className="profile-setup-step-list">
              {steps.map((step, index) => {
                const milestoneComplete =
                  step.key === "contact"
                    ? milestones.contact
                    : step.key === "home"
                      ? milestones.home
                      : step.key === "personal"
                        ? milestones.personal
                        : step.key === "interests"
                          ? milestones.interests
                          : step.key === "skills"
                            ? milestones.skills
                            : step.key === "availability"
                              ? milestones.availability
                              : step.key === "event-readiness"
                                ? milestones.eventReadiness
                                : step.key === "education"
                                  ? milestones.education
                                  : step.key === "photo"
                                    ? milestones.photo
                                    : step.key === "about"
                                      ? Boolean(profile?.bio)
                                      : completeCount === 9;

                return (
                  <li
                    key={step.key}
                    data-current={step.key === currentStep ? "true" : "false"}
                    data-complete={milestoneComplete ? "true" : "false"}
                  >
                    <Link href={stepHref(step.key, false)}>
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
          ) : null}
        </aside>

        <section className="profile-setup-stage" aria-labelledby="profile-setup-title">
          <div className="profile-setup-stage-header">
            <p>
              {editMode ? "Profile details" : `Step ${currentIndex + 1} of ${steps.length}`}
            </p>
            <h1 id="profile-setup-title">
              {currentStep === "contact"
                ? "Contact details"
                : currentStep === "home"
                  ? "Home area"
                  : currentStep === "personal"
                    ? "Personal details"
                    : currentStep === "interests"
                      ? "Volunteering interests"
                      : currentStep === "skills"
                        ? "Skills"
                        : currentStep === "availability"
                          ? "Availability"
                          : currentStep === "event-readiness"
                            ? "Event readiness"
                            : currentStep === "education"
                              ? "Education"
                              : currentStep === "photo"
                                ? "Profile photo"
                                : currentStep === "about"
                                  ? "About you"
                                  : "Review your profile"}
            </h1>
            <p>
              {currentStep === "home"
                ? "Your postal code and address help us understand where our volunteers are based. Neighbourhood and constituency reporting is derived separately from verified location data."
                : currentStep === "event-readiness"
                  ? "These details help us prepare meals and volunteer shirts for activities."
                  : currentStep === "personal"
                    ? "Your date of birth helps us understand our volunteer community and apply age-appropriate event requirements."
                    : currentStep === "education"
                      ? "Your highest qualification helps us understand the experience represented across the volunteer community."
                      : currentStep === "photo"
                        ? "Tap the photo to add or replace it. You can change just your photo at any time."
                        : currentStep === "review"
                          ? "Check that the required information is complete. You can edit individual sections later."
                          : "Keep this information current so KELUARGA can support your volunteering journey."}
            </p>
          </div>

          {errorMessage ? (
            <div className="notice notice-error" role="alert">
              {errorMessage}
            </div>
          ) : null}

          {currentStep === "contact" ? (
            <form action={saveContactStep} className="profile-setup-form">
              {editMode ? <input type="hidden" name="mode" value="edit" /> : null}
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
                  {editMode ? "Save changes" : "Save and continue"}
                </button>
              </div>
            </form>
          ) : null}

          {currentStep === "home" ? (
            <form action={saveHomeStep} className="profile-setup-form">
              {editMode ? <input type="hidden" name="mode" value="edit" /> : null}
              <div className="form-field">
                <label htmlFor="setup-postal-code">Postal code</label>
                <input
                  id="setup-postal-code"
                  name="postalCode"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  defaultValue={privateDetails?.postal_code ?? ""}
                  placeholder="6-digit postal code"
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="setup-address">Address</label>
                <textarea
                  id="setup-address"
                  name="addressLine"
                  rows={3}
                  maxLength={500}
                  defaultValue={privateDetails?.address_line ?? ""}
                  placeholder="Block / house number and street name"
                  required
                />
                <span className="form-help">
                  Unit number is not required for neighbourhood reporting.
                </span>
              </div>
              {privateDetails?.planning_area || privateDetails?.electoral_division ? (
                <div className="profile-setup-derived-location">
                  {privateDetails.planning_area ? (
                    <span>Planning area: <strong>{privateDetails.planning_area}</strong></span>
                  ) : null}
                  {privateDetails.electoral_division ? (
                    <span>Electoral division: <strong>{privateDetails.electoral_division}</strong></span>
                  ) : null}
                </div>
              ) : null}
              <div className="profile-setup-actions">
                {!editMode ? (
                  <Link className="button button-secondary" href={stepHref("contact", false)}>
                    Back
                  </Link>
                ) : null}
                <button className="button button-primary" type="submit">
                  {editMode ? "Save changes" : "Save and continue"}
                </button>
              </div>
            </form>
          ) : null}

          {currentStep === "personal" ? (
            <form action={savePersonalStep} className="profile-setup-form">
              {editMode ? <input type="hidden" name="mode" value="edit" /> : null}
              <div className="form-field">
                <label htmlFor="setup-dob">Date of birth</label>
                <input
                  id="setup-dob"
                  name="dateOfBirth"
                  type="date"
                  defaultValue={privateDetails?.date_of_birth ?? ""}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="setup-languages">Languages spoken <span className="muted">(optional)</span></label>
                <input
                  id="setup-languages"
                  name="languagesSpoken"
                  defaultValue={privateDetails?.languages_spoken?.join(", ") ?? ""}
                  placeholder="English, Malay, Mandarin"
                />
                <span className="form-help">Separate languages with commas.</span>
              </div>
              <div className="form-field">
                <label htmlFor="setup-emergency-name">Emergency contact name <span className="muted">(optional)</span></label>
                <input
                  id="setup-emergency-name"
                  name="emergencyContactName"
                  maxLength={160}
                  defaultValue={privateDetails?.emergency_contact_name ?? ""}
                />
              </div>
              <div className="form-field">
                <label htmlFor="setup-emergency-mobile">Emergency contact number <span className="muted">(optional)</span></label>
                <input
                  id="setup-emergency-mobile"
                  name="emergencyContactMobile"
                  maxLength={40}
                  inputMode="tel"
                  defaultValue={privateDetails?.emergency_contact_mobile ?? ""}
                />
              </div>
              <div className="profile-setup-actions">
                {!editMode ? <Link className="button button-secondary" href={stepHref("home", false)}>Back</Link> : null}
                <button className="button button-primary" type="submit">
                  {editMode ? "Save changes" : "Save and continue"}
                </button>
              </div>
            </form>
          ) : null}

          {currentStep === "interests" ? (
            <form action={saveInterestsStep} className="profile-setup-form">
              {editMode ? <input type="hidden" name="mode" value="edit" /> : null}
              <div className="form-field">
                <label htmlFor="setup-interests">Volunteering interests</label>
                <input
                  id="setup-interests"
                  name="interests"
                  defaultValue={profile?.interests?.join(", ") ?? ""}
                  placeholder="Mentoring, Youth, Community, Education"
                  required
                />
                <span className="form-help">Separate interests with commas.</span>
              </div>
              <div className="profile-setup-actions">
                {!editMode ? <Link className="button button-secondary" href={stepHref("personal", false)}>Back</Link> : null}
                <button className="button button-primary" type="submit">{editMode ? "Save changes" : "Save and continue"}</button>
              </div>
            </form>
          ) : null}

          {currentStep === "skills" ? (
            <form action={saveSkillsStep} className="profile-setup-form">
              {editMode ? <input type="hidden" name="mode" value="edit" /> : null}
              <div className="form-field">
                <label htmlFor="setup-skills">Skills</label>
                <input
                  id="setup-skills"
                  name="skills"
                  defaultValue={profile?.skills?.join(", ") ?? ""}
                  placeholder="Facilitation, Photography, Logistics"
                  required
                />
                <span className="form-help">Separate skills with commas.</span>
              </div>
              <div className="profile-setup-actions">
                {!editMode ? <Link className="button button-secondary" href={stepHref("interests", false)}>Back</Link> : null}
                <button className="button button-primary" type="submit">{editMode ? "Save changes" : "Save and continue"}</button>
              </div>
            </form>
          ) : null}

          {currentStep === "availability" ? (
            <form action={saveAvailabilityStep} className="profile-setup-form">
              {editMode ? <input type="hidden" name="mode" value="edit" /> : null}
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
                />
              </div>
              <div className="profile-setup-actions">
                {!editMode ? <Link className="button button-secondary" href={stepHref("skills", false)}>Back</Link> : null}
                <button className="button button-primary" type="submit">{editMode ? "Save changes" : "Save and continue"}</button>
              </div>
            </form>
          ) : null}

          {currentStep === "event-readiness" ? (
            <form action={saveEventReadinessStep} className="profile-setup-form">
              {editMode ? <input type="hidden" name="mode" value="edit" /> : null}
              <div className="form-field">
                <label htmlFor="setup-shirt-size">Volunteer T-shirt size</label>
                <select
                  id="setup-shirt-size"
                  name="tshirtSize"
                  defaultValue={privateDetails?.tshirt_size ?? ""}
                  required
                >
                  <option value="" disabled>Select size</option>
                  {shirtSizes.map((size) => <option value={size} key={size}>{size}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="setup-dietary">Dietary requirements <span className="muted">(optional)</span></label>
                <textarea
                  id="setup-dietary"
                  name="dietaryRequirements"
                  rows={3}
                  maxLength={800}
                  defaultValue={privateDetails?.dietary_requirements ?? ""}
                  placeholder="For example: vegetarian, halal-only, no seafood"
                />
              </div>
              <div className="form-field">
                <label htmlFor="setup-allergies">Food allergies</label>
                <textarea
                  id="setup-allergies"
                  name="foodAllergies"
                  rows={3}
                  maxLength={800}
                  defaultValue={privateDetails?.food_allergies ?? ""}
                  placeholder="List any known food allergies"
                />
              </div>
              <label className="profile-setup-inline-check">
                <input
                  type="checkbox"
                  name="noKnownFoodAllergies"
                  defaultChecked={privateDetails?.no_known_food_allergies ?? false}
                />
                <span>I have no known food allergies</span>
              </label>
              <div className="profile-setup-actions">
                {!editMode ? <Link className="button button-secondary" href={stepHref("availability", false)}>Back</Link> : null}
                <button className="button button-primary" type="submit">{editMode ? "Save changes" : "Save and continue"}</button>
              </div>
            </form>
          ) : null}

          {currentStep === "education" ? (
            <form action={saveEducationStep} className="profile-setup-form">
              {editMode ? <input type="hidden" name="mode" value="edit" /> : null}
              <div className="form-field">
                <label htmlFor="setup-qualification">Highest qualification</label>
                <select
                  id="setup-qualification"
                  name="highestQualification"
                  defaultValue={privateDetails?.highest_qualification ?? ""}
                  required
                >
                  <option value="" disabled>Select qualification</option>
                  {qualifications.map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="setup-institution">School / institution <span className="muted">(optional)</span></label>
                <input
                  id="setup-institution"
                  name="institution"
                  maxLength={200}
                  defaultValue={privateDetails?.institution ?? ""}
                />
              </div>
              <div className="form-field">
                <label htmlFor="setup-field-study">Field of study <span className="muted">(optional)</span></label>
                <input
                  id="setup-field-study"
                  name="fieldOfStudy"
                  maxLength={200}
                  defaultValue={privateDetails?.field_of_study ?? ""}
                />
              </div>
              <div className="profile-setup-actions">
                {!editMode ? <Link className="button button-secondary" href={stepHref("event-readiness", false)}>Back</Link> : null}
                <button className="button button-primary" type="submit">{editMode ? "Save changes" : "Save and continue"}</button>
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
              <p className="muted">Tap the photo to choose or replace your image.</p>
              <div className="profile-setup-actions">
                {editMode ? (
                  <Link className="button button-primary" href="/profile/edit?success=photo">
                    Done
                  </Link>
                ) : (
                  <>
                    <Link className="button button-secondary" href={stepHref("education", false)}>Back</Link>
                    <Link className="button button-primary" href={stepHref("about", false)}>Continue</Link>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {currentStep === "about" ? (
            <form action={saveAboutStep} className="profile-setup-form">
              {editMode ? <input type="hidden" name="mode" value="edit" /> : null}
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
                {!editMode ? <Link className="button button-secondary" href={stepHref("photo", false)}>Back</Link> : null}
                <button className="button button-primary" type="submit">{editMode ? "Save changes" : "Continue"}</button>
              </div>
            </form>
          ) : null}

          {currentStep === "review" ? (
            <div className="profile-setup-review">
              <div className="profile-setup-review-score">
                <strong>{completion}%</strong>
                <span>{completeCount} of 9 essentials complete</span>
              </div>

              <div className="profile-setup-review-list">
                {[
                  ["Contact details", milestones.contact, "contact"],
                  ["Home area", milestones.home, "home"],
                  ["Personal details", milestones.personal, "personal"],
                  ["Volunteering interests", milestones.interests, "interests"],
                  ["Skills", milestones.skills, "skills"],
                  ["Availability", milestones.availability, "availability"],
                  ["Event readiness", milestones.eventReadiness, "event-readiness"],
                  ["Education", milestones.education, "education"],
                  ["Profile photo", milestones.photo, "photo"],
                ].map(([label, done, step]) => (
                  <Link key={String(step)} href={stepHref(step as SetupStep, false)}>
                    <span className="profile-setup-review-check" data-complete={done ? "true" : "false"}>
                      {done ? "✓" : "○"}
                    </span>
                    <strong>{label}</strong>
                    <span aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>

              <div className="profile-setup-actions">
                <Link className="button button-secondary" href={stepHref("about", false)}>Back</Link>
                <form action={completeProfileSetup}>
                  <button className="button button-primary" type="submit" disabled={completeCount < 9}>
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
