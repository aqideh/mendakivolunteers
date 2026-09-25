"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  updateRosterVolunteerProfileDetails,
  type RosterProfileDetailsState,
} from "@/app/admin/events/roster-actions";

const tshirtSizes = ["S", "M", "L", "XL", "2XL", "3XL", "5XL", "7XL"] as const;

const initialState: RosterProfileDetailsState = {
  status: "idle",
  message: "",
};

export function RosterProfileDetailsEditor({
  eventId,
  volunteerId,
  volunteerName,
  tshirtSize,
  dietaryRequirements,
}: {
  eventId: string;
  volunteerId: string;
  volunteerName: string;
  tshirtSize: string | null;
  dietaryRequirements: string | null;
}) {
  const router = useRouter();
  const [shirt, setShirt] = useState(tshirtSize ?? "");
  const [dietary, setDietary] = useState(dietaryRequirements ?? "");
  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setState(initialState);
    startTransition(async () => {
      const result = await updateRosterVolunteerProfileDetails({
        eventId,
        volunteerId,
        tshirtSize:
          shirt === "" ? null : (shirt as (typeof tshirtSizes)[number]),
        dietaryRequirements: dietary,
      });
      setState(result);
      if (result.status === "success") router.refresh();
    });
  }

  return (
    <details className="phaseone-attendance-edit">
      <summary>Profile details</summary>
      <div className="phaseone-attendance-correction">
        <p className="muted">
          Update missing operational profile details for {volunteerName}. These
          values are saved to the volunteer database and reused for future rosters.
        </p>

        <div className="form-grid">
          <div className="form-field">
            <label htmlFor={`profile-shirt-${volunteerId}`}>T-shirt size</label>
            <select
              id={`profile-shirt-${volunteerId}`}
              onChange={(event) => setShirt(event.target.value)}
              value={shirt}
            >
              <option value="">Not set</option>
              {tshirtSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor={`profile-dietary-${volunteerId}`}>
              Dietary requirements
            </label>
            <input
              id={`profile-dietary-${volunteerId}`}
              maxLength={800}
              onChange={(event) => setDietary(event.target.value)}
              placeholder="e.g. Halal, vegetarian, no seafood"
              value={dietary}
            />
          </div>
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
            {state.message}
          </div>
        ) : null}

        <button
          className="button button-secondary"
          disabled={isPending}
          onClick={submit}
          type="button"
        >
          {isPending ? "Saving…" : "Save profile details"}
        </button>
      </div>
    </details>
  );
}
