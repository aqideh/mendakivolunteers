"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addManualVolunteerToRoster,
  type ManualRosterVolunteerState,
} from "@/app/admin/events/roster-actions";

type RosterTimeslot = Readonly<{
  id: string;
  label: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
}>;

const initialState: ManualRosterVolunteerState = {
  status: "idle",
  message: "",
};

const tshirtSizes = ["S", "M", "L", "XL", "2XL", "3XL", "5XL", "7XL"] as const;

function singaporeDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function singaporeTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function timeslotLabel(timeslot: RosterTimeslot): string {
  const start = singaporeTime(timeslot.starts_at);
  const end = timeslot.ends_at ? singaporeTime(timeslot.ends_at) : null;
  const time = end ? `${start}–${end}` : start;
  return `${singaporeDate(timeslot.starts_at)} · ${timeslot.label?.trim() || time}${timeslot.label?.trim() ? ` · ${time}` : ""}`;
}

export function ManualRosterVolunteerForm({
  eventId,
  timeslots,
}: {
  eventId: string;
  timeslots: readonly RosterTimeslot[];
}) {
  const router = useRouter();
  const activeTimeslots = useMemo(
    () => timeslots.filter((timeslot) => timeslot.status !== "cancelled"),
    [timeslots],
  );
  const [volunteerName, setVolunteerName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [age, setAge] = useState("");
  const [tshirtSize, setTshirtSize] = useState("");
  const [dietaryRequirements, setDietaryRequirements] = useState("");
  const [selectedTimeslots, setSelectedTimeslots] = useState<string[]>(
    activeTimeslots.length === 1 ? [activeTimeslots[0]!.id] : [],
  );
  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();

  function toggleTimeslot(id: string) {
    setSelectedTimeslots((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function resetForm() {
    setVolunteerName("");
    setEmail("");
    setMobile("");
    setAge("");
    setTshirtSize("");
    setDietaryRequirements("");
    setSelectedTimeslots(
      activeTimeslots.length === 1 ? [activeTimeslots[0]!.id] : [],
    );
  }

  function submit() {
    setState(initialState);

    const parsedAge = age.trim() === "" ? null : Number(age);
    if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 120)) {
      setState({
        status: "error",
        message: "Age must be a whole number between 0 and 120.",
      });
      return;
    }

    startTransition(async () => {
      const result = await addManualVolunteerToRoster({
        eventId,
        timeslotIds: selectedTimeslots,
        volunteerName,
        email,
        mobile,
        age: parsedAge,
        tshirtSize:
          tshirtSize === ""
            ? null
            : (tshirtSize as (typeof tshirtSizes)[number]),
        dietaryRequirements,
      });

      setState(result);

      if (result.status === "success") {
        resetForm();
        router.refresh();
      }
    });
  }

  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <h3>Add a volunteer manually</h3>
          <p className="muted">
            Use this for planned roster setup when the volunteer is not yet in the
            database. A new KELUARGA Volunteer ID is issued automatically when a new
            canonical volunteer record is created. This is separate from walk-in
            registration.
          </p>
        </div>
      </div>

      <div className="phaseone-admin-form">
        <div className="form-field">
          <label htmlFor={`manual-volunteer-name-${eventId}`}>Full name</label>
          <input
            autoComplete="name"
            id={`manual-volunteer-name-${eventId}`}
            maxLength={120}
            onChange={(event) => setVolunteerName(event.target.value)}
            placeholder="Volunteer name"
            value={volunteerName}
          />
        </div>

        <div className="form-grid">
          <div className="form-field">
            <label htmlFor={`manual-volunteer-email-${eventId}`}>Email</label>
            <input
              autoComplete="email"
              id={`manual-volunteer-email-${eventId}`}
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              type="email"
              value={email}
            />
          </div>

          <div className="form-field">
            <label htmlFor={`manual-volunteer-mobile-${eventId}`}>Mobile</label>
            <input
              autoComplete="tel"
              id={`manual-volunteer-mobile-${eventId}`}
              maxLength={40}
              onChange={(event) => setMobile(event.target.value)}
              placeholder="+65 8123 4567"
              type="tel"
              value={mobile}
            />
          </div>
        </div>

        <p className="muted">
          Enter at least an email or mobile number. These details are checked against
          existing volunteer records before a new record is created.
        </p>

        <div className="form-grid">
          <div className="form-field">
            <label htmlFor={`manual-volunteer-age-${eventId}`}>Age (optional)</label>
            <input
              id={`manual-volunteer-age-${eventId}`}
              inputMode="numeric"
              max={120}
              min={0}
              onChange={(event) => setAge(event.target.value)}
              placeholder="e.g. 24"
              type="number"
              value={age}
            />
          </div>

          <div className="form-field">
            <label htmlFor={`manual-volunteer-shirt-${eventId}`}>
              T-shirt size (optional)
            </label>
            <select
              id={`manual-volunteer-shirt-${eventId}`}
              onChange={(event) => setTshirtSize(event.target.value)}
              value={tshirtSize}
            >
              <option value="">Not set</option>
              {tshirtSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor={`manual-volunteer-dietary-${eventId}`}>
            Dietary requirements (optional)
          </label>
          <textarea
            id={`manual-volunteer-dietary-${eventId}`}
            maxLength={500}
            onChange={(event) => setDietaryRequirements(event.target.value)}
            placeholder="Dietary requirements or food allergies relevant to this event"
            rows={3}
            value={dietaryRequirements}
          />
        </div>

        <div className="form-field">
          <label>Assign to shift</label>
          {activeTimeslots.length === 0 ? (
            <p className="notice notice-error">
              Add an active event shift before assigning volunteers.
            </p>
          ) : (
            <div className="phaseone-compact-list">
              {activeTimeslots.map((timeslot) => (
                <label key={timeslot.id}>
                  <input
                    checked={selectedTimeslots.includes(timeslot.id)}
                    onChange={() => toggleTimeslot(timeslot.id)}
                    type="checkbox"
                  />{" "}
                  {timeslotLabel(timeslot)}
                </label>
              ))}
            </div>
          )}
        </div>

        {state.message ? (
          <div
            className={
              state.status === "error"
                ? "notice notice-error"
                : "notice notice-success"
            }
            role={state.status === "error" ? "alert" : "status"}
          >
            <strong>{state.message}</strong>
            {state.status === "success" && state.volunteerCode ? (
              <p className="muted">
                KELUARGA Volunteer ID: {state.volunteerCode}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="actions">
          <button
            className="button button-primary"
            disabled={
              isPending ||
              volunteerName.trim().length === 0 ||
              (!email.trim() && !mobile.trim()) ||
              selectedTimeslots.length === 0
            }
            onClick={submit}
            type="button"
          >
            {isPending ? "Adding volunteer…" : "Create / add volunteer"}
          </button>
        </div>
      </div>
    </div>
  );
}
