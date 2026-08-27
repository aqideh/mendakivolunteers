"use client";

import { useState, useTransition, type FormEvent } from "react";

import { saveEvent } from "@/app/admin/events/actions";
import { toSingaporeDateTimeLocal } from "@/lib/content/dates";

import { TimeslotEditor } from "./timeslot-editor";

const defaultAttireNotes = "Wear your MENDAKI volunteer shirt if you have one.";

export type EventTimeslotValue = Readonly<{
  id: string;
  label: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "scheduled" | "cancelled";
  sort_order: number;
}>;

export type EventFormValue = Readonly<{
  id: string;
  external_opportunity_id: string | null;
  title: string;
  slug: string;
  venue: string | null;
  navigation_destination: string | null;
  attire_notes: string;
  preparation_notes: string | null;
  programme_rundown_url: string | null;
  briefing_url: string | null;
  briefing_available_at: string | null;
  whatsapp_url: string | null;
  sign_in_url: string | null;
  sign_out_url: string | null;
  has_sign_in_pin: boolean;
  has_sign_out_pin: boolean;
  is_published: boolean;
  timeslots: EventTimeslotValue[];
}>;

type OpportunityOption = Readonly<{
  id: string;
  title: string;
  starts_at: string | null;
}>;

type SaveState = Readonly<{
  status: "idle" | "error";
  message: string;
}>;

export function EventForm({
  event,
  opportunities,
}: {
  event?: EventFormValue;
  opportunities: readonly OpportunityOption[];
}) {
  const initialTimeslots = (event?.timeslots ?? []).map((timeslot) => ({
    id: timeslot.id,
    label: timeslot.label ?? "",
    startsAt: toSingaporeDateTimeLocal(timeslot.starts_at),
    endsAt: toSingaporeDateTimeLocal(timeslot.ends_at),
    status: timeslot.status,
  }));
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle", message: "" });
  const [recoveryEventId, setRecoveryEventId] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    const form = submitEvent.currentTarget;
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    if (!event?.id && recoveryEventId) formData.set("id", recoveryEventId);

    setSaveState({ status: "idle", message: "" });
    startSaving(async () => {
      try {
        const result = await saveEvent(formData);
        if (result.status === "error") {
          if (!event?.id && result.eventId) setRecoveryEventId(result.eventId);
          setSaveState({ status: "error", message: result.message });
        }
      } catch (error) {
        console.error("Unable to submit event guide", error);
        setSaveState({
          status: "error",
          message: "The event guide could not be saved because the request failed. Your entries have been kept; try again.",
        });
      }
    });
  }

  return (
    <form className="phaseone-admin-form" onSubmit={handleSubmit}>
      {event?.id || recoveryEventId ? (
        <input name="id" type="hidden" value={event?.id ?? recoveryEventId ?? ""} />
      ) : null}

      <div className="form-field">
        <label htmlFor="title">Event title</label>
        <input defaultValue={event?.title} id="title" maxLength={160} name="title" required />
      </div>

      <TimeslotEditor initialTimeslots={initialTimeslots} />

      <fieldset className="phaseone-admin-fieldset">
        <legend>Location</legend>
        <div className="form-field">
          <label htmlFor="venue">Venue</label>
          <input defaultValue={event?.venue ?? ""} id="venue" maxLength={240} name="venue" />
        </div>
        <div className="form-field">
          <label htmlFor="navigationDestination">Address for directions</label>
          <input
            defaultValue={event?.navigation_destination ?? ""}
            id="navigationDestination"
            maxLength={500}
            name="navigationDestination"
            placeholder="Venue, street address or postal code"
          />
        </div>
      </fieldset>

      <fieldset className="phaseone-admin-fieldset">
        <legend>Volunteer preparation</legend>
        <div className="form-field">
          <label htmlFor="attireNotes">Attire reminder</label>
          <textarea
            defaultValue={event?.attire_notes ?? defaultAttireNotes}
            id="attireNotes"
            maxLength={500}
            name="attireNotes"
            required
            rows={2}
          />
        </div>
        <div className="form-field">
          <label htmlFor="preparationNotes">What volunteers should know</label>
          <textarea
            defaultValue={event?.preparation_notes ?? ""}
            id="preparationNotes"
            maxLength={2000}
            name="preparationNotes"
            placeholder="Reporting point, what to bring, meal arrangements or other instructions"
            rows={4}
          />
        </div>
      </fieldset>

      <details className="phaseone-disclosure">
        <summary>Volunteer links</summary>
        <div className="phaseone-disclosure-body">
          <div className="form-field">
            <label htmlFor="whatsappUrl">WhatsApp group</label>
            <input defaultValue={event?.whatsapp_url ?? ""} id="whatsappUrl" name="whatsappUrl" type="url" />
          </div>
          <div className="phaseone-admin-grid">
            <div className="form-field">
              <label htmlFor="briefingUrl">Briefing link</label>
              <input defaultValue={event?.briefing_url ?? ""} id="briefingUrl" name="briefingUrl" type="url" />
            </div>
            <div className="form-field">
              <label htmlFor="briefingAvailableAt">Briefing release time</label>
              <input
                defaultValue={toSingaporeDateTimeLocal(event?.briefing_available_at ?? null)}
                id="briefingAvailableAt"
                name="briefingAvailableAt"
                type="datetime-local"
              />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="programmeRundownUrl">Legacy programme rundown image URL</label>
            <input
              defaultValue={event?.programme_rundown_url ?? ""}
              id="programmeRundownUrl"
              name="programmeRundownUrl"
              type="url"
            />
            <p className="muted">Use this only for an externally hosted rundown image. Uploaded rundown images are managed separately below.</p>
          </div>
        </div>
      </details>

      <details className="phaseone-disclosure" open={Boolean(event?.has_sign_in_pin || event?.has_sign_out_pin || event?.sign_in_url || event?.sign_out_url)}>
        <summary>Attendance settings</summary>
        <div className="phaseone-disclosure-body">
          <p className="muted">Only configure these controls when volunteers need in-app check-in or check-out.</p>
          <div className="phaseone-admin-grid">
            <div className="form-field">
              <label htmlFor="signInUrl">Sign-in URL</label>
              <input defaultValue={event?.sign_in_url ?? ""} id="signInUrl" name="signInUrl" type="url" />
            </div>
            <div className="form-field">
              <label htmlFor="signOutUrl">Sign-out URL</label>
              <input defaultValue={event?.sign_out_url ?? ""} id="signOutUrl" name="signOutUrl" type="url" />
            </div>
          </div>
          <div className="phaseone-admin-grid">
            <fieldset className="phaseone-admin-fieldset">
              <legend>Check-in PIN</legend>
              <div className="form-field">
                <label htmlFor="signInPin">{event?.has_sign_in_pin ? "Change PIN" : "Set PIN"}</label>
                <input
                  autoComplete="new-password"
                  id="signInPin"
                  inputMode="numeric"
                  name="signInPin"
                  pattern="[0-9]{4,8}"
                  placeholder={event?.has_sign_in_pin ? "Leave blank to keep current PIN" : "Optional — 4 to 8 digits"}
                  type="password"
                />
              </div>
              {event?.has_sign_in_pin ? (
                <label className="checkbox-row"><input name="clearSignInPin" type="checkbox" /> Remove check-in PIN</label>
              ) : null}
            </fieldset>
            <fieldset className="phaseone-admin-fieldset">
              <legend>Check-out PIN</legend>
              <div className="form-field">
                <label htmlFor="signOutPin">{event?.has_sign_out_pin ? "Change PIN" : "Set PIN"}</label>
                <input
                  autoComplete="new-password"
                  id="signOutPin"
                  inputMode="numeric"
                  name="signOutPin"
                  pattern="[0-9]{4,8}"
                  placeholder={event?.has_sign_out_pin ? "Leave blank to keep current PIN" : "Optional — 4 to 8 digits"}
                  type="password"
                />
              </div>
              {event?.has_sign_out_pin ? (
                <label className="checkbox-row"><input name="clearSignOutPin" type="checkbox" /> Remove check-out PIN</label>
              ) : null}
            </fieldset>
          </div>
        </div>
      </details>

      <details className="phaseone-disclosure">
        <summary>Advanced event settings</summary>
        <div className="phaseone-disclosure-body">
          <div className="form-field">
            <label htmlFor="externalOpportunityId">Linked Volunteer.gov.sg opportunity</label>
            <select defaultValue={event?.external_opportunity_id ?? ""} id="externalOpportunityId" name="externalOpportunityId">
              <option value="">No linked opportunity</option>
              {opportunities.map((opportunity) => (
                <option key={opportunity.id} value={opportunity.id}>{opportunity.title}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="slug">Public journey URL</label>
            <input
              autoCapitalize="none"
              defaultValue={event?.slug}
              id="slug"
              name="slug"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="event-name"
              required
            />
          </div>
        </div>
      </details>

      <div className="phaseone-publish-row">
        <label className="checkbox-row">
          <input defaultChecked={event?.is_published} name="isPublished" type="checkbox" />
          Publish event guide to volunteers
        </label>
        <p className="muted">Publishing needs a scheduled shift, venue and directions address. Other features are optional.</p>
      </div>

      {saveState.status === "error" ? (
        <div className="notice notice-error" role="alert" aria-live="polite">{saveState.message}</div>
      ) : null}

      <div className="actions phaseone-sticky-actions">
        <button className="button button-primary" disabled={isSaving} type="submit">
          {isSaving
            ? event || recoveryEventId ? "Saving…" : "Creating…"
            : event || recoveryEventId ? "Save event guide" : "Create event guide"}
        </button>
      </div>
    </form>
  );
}
