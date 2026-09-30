"use client";

import { useState } from "react";

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

const fieldOfStudyRequiredQualifications = new Set([
  "ite",
  "diploma",
  "bachelors",
  "postgraduate",
]);

type ProfileEducationFieldsProps = Readonly<{
  highestQualification: string | null;
  institution: string | null;
  fieldOfStudy: string | null;
}>;

export function ProfileEducationFields({
  highestQualification,
  institution,
  fieldOfStudy,
}: ProfileEducationFieldsProps) {
  const [qualification, setQualification] = useState(highestQualification ?? "");
  const fieldOfStudyRequired = fieldOfStudyRequiredQualifications.has(qualification);

  return (
    <>
      <div className="form-field">
        <label htmlFor="setup-qualification">Highest qualification</label>
        <select
          id="setup-qualification"
          name="highestQualification"
          value={qualification}
          onChange={(event) => setQualification(event.target.value)}
          required
        >
          <option value="" disabled>Select qualification</option>
          {qualifications.map(([value, label]) => (
            <option value={value} key={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="setup-institution">School / institution</label>
        <input
          id="setup-institution"
          name="institution"
          maxLength={200}
          defaultValue={institution ?? ""}
          required
        />
      </div>
      <div className="form-field">
        <label htmlFor="setup-field-study">
          Field of study
          {!fieldOfStudyRequired ? <span className="muted"> (optional)</span> : null}
        </label>
        <input
          id="setup-field-study"
          name="fieldOfStudy"
          maxLength={200}
          defaultValue={fieldOfStudy ?? ""}
          required={fieldOfStudyRequired}
          aria-required={fieldOfStudyRequired}
        />
        <span className="form-help">
          Required for ITE, Diploma, Bachelor's degree and Postgraduate qualifications.
        </span>
      </div>
    </>
  );
}
