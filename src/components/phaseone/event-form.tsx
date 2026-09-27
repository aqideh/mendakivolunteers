"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { saveEvent } from "@/app/admin/events/actions";
import { saveEventFormDraft } from "@/app/admin/events/draft-actions";
import { toSingaporeDateTimeLocal } from "@/lib/content/dates";

import { EventImageUploader } from "./event-image-uploader";
import { TimeslotEditor } from "./timeslot-editor";

const defaultAttireNotes = "Wear your MENDAKI volunteer shirt if you have one.";

export type EventTimeslotValue = Readonly<{
  id: string;
  label: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "scheduled" | "cancelled";
  sort_order: number;
  registration_capacity: number | null;
}>;

export type EventFormValue = Readonly<{
  id: string;
  title: string;
  opportunity_summary: string | null;
  opportunity_description: string | null;
  opportunity_image_url: string | null;
  opportunity_category: string | null;
  opportunity_eligibility: string | null;
  registration_deadline: string | null;
  opportunity_sort_order: number | null;
  is_opportunity_published: boolean;
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

type SaveState = Readonly<{
  status: "idle" | "error";
  message: string;
}>;

type EventFormDraft = Readonly<{
  payload: Record<string, unknown>;
  updatedAt: string;
}>;

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function draftString(draft: EventFormDraft | undefined, key: string): string {
  const value = draft?.payload[key];
  return typeof value === "string" ? value : "";
}

function draftTimeslots(draft: EventFormDraft | undefined) {
  const serialized = draftString(draft, "timeslotsJson");
  if (!serialized) return [];
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        ...(typeof item.id === "string" ? { id: item.id } : {}),
        label: typeof item.label === "string" ? item.label : "",
        startsAt: typeof item.startsAt === "string" ? item.startsAt : "",
        endsAt: typeof item.endsAt === "string" ? item.endsAt : "",
        status: item.status === "cancelled" ? "cancelled" as const : "scheduled" as const,
        registrationCapacity:
          typeof item.registrationCapacity === "number" && Number.isFinite(item.registrationCapacity)
            ? item.registrationCapacity
            : null,
      }));
  } catch {
    return [];
  }
}

export function EventForm({
  event,
  draft,
}: {
  event?: EventFormValue;
  draft?: EventFormDraft;
}) {
  const restoredTimeslots = !event ? draftTimeslots(draft) : [];
  const initialTimeslots = (event?.timeslots ?? []).map((timeslot) => ({
    id: timeslot.id,
    label: timeslot.label ?? "",
    startsAt: toSingaporeDateTimeLocal(timeslot.starts_at),
    endsAt: toSingaporeDateTimeLocal(timeslot.ends_at),
    status: timeslot.status,
    registrationCapacity: timeslot.registration_capacity,
  }));
  const effectiveInitialTimeslots = initialTimeslots.length > 0 ? initialTimeslots : restoredTimeslots;
  const formRef = useRef<HTMLFormElement | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle", message: "" });
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">(
    draft ? "saved" : "idle",
  );
  const [recoveryEventId, setRecoveryEventId] = useState<string | null>(null);
  const [opportunityImageUrl, setOpportunityImageUrl] = useState(
    event?.opportunity_image_url ?? draftString(draft, "opportunityImageUrl"),
  );
  const [slug, setSlug] = useState(event?.slug ?? draftString(draft, "slug"));
  const [slugTouched, setSlugTouched] = useState(Boolean(event?.slug || draftString(draft, "slug")));
  const [isSaving, startSaving] = useTransition();
  const currentEventId = event?.id ?? recoveryEventId;

  useEffect(() => {
    if (event || !draft || !formRef.current) return;
    const form = formRef.current;
    for (const [name, value] of Object.entries(draft.payload)) {
      if (name === "timeslotsJson" || name === "opportunityImageUrl" || name === "slug") continue;
      const control = form.elements.namedItem(name);
      if (control instanceof HTMLInputElement) {
        if (control.type === "checkbox") control.checked = value === true;
        else if (typeof value === "string" || typeof value === "number") control.value = String(value);
      } else if (control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
        if (typeof value === "string" || typeof value === "number") control.value = String(value);
      }
    }
  }, [draft, event]);

  function draftPayload(form: HTMLFormElement) {
    const data = new FormData(form);
    const payload: Record<string, string | boolean> = {};
    for (const [key, value] of data.entries()) {
      if (typeof value !== "string") continue;
      if (["id", "signInPin", "signOutPin", "clearSignInPin", "clearSignOutPin"].includes(key)) continue;
      payload[key] = value;
    }
    payload.isOpportunityPublished =
      (form.elements.namedItem("isOpportunityPublished") as HTMLInputElement | null)?.checked ?? false;
    payload.isPublished =
      (form.elements.namedItem("isPublished") as HTMLInputElement | null)?.checked ?? false;
    return payload;
  }

  async function autosaveNow() {
    if (event || !formRef.current) return;
    setDraftStatus("saving");
    try {
      const result = await saveEventFormDraft(draftPayload(formRef.current));
      setDraftStatus("error" in result ? "error" : "saved");
    } catch (error) {
      console.error("Unable to autosave programme draft", error);
      setDraftStatus("error");
    }
  }

  function scheduleAutosave() {
    if (event) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setDraftStatus("saving");
    autosaveTimer.current = setTimeout(() => {
      void autosaveNow();
    }, 700);
  }

  useEffect(
    () => () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    },
    [],
  );

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
    <form
      className="phaseone-admin-form"
      onChange={scheduleAutosave}
      onInput={scheduleAutosave}
      onSubmit={handleSubmit}
      ref={formRef}
    >
      {event?.id || recoveryEventId ? (
        <input name="id" type="hidden" value={event?.id ?? recoveryEventId ?? ""} />
      ) : null}

      <div className="form-field event-form-anchor" id="event-schedule">
        <label htmlFor="title">Event title</label>
        <input
          defaultValue={event?.title ?? draftString(draft, "title")}
          id="title"
          maxLength={160}
          name="title"
          onChange={(inputEvent) => {
            if (!event && !slugTouched) setSlug(slugify(inputEvent.currentTarget.value));
          }}
          required
        />
      </div>

      <fieldset className="phaseone-admin-fieldset event-form-anchor" id="event-opportunity">
        <legend>Opportunity listing</legend>
        <label className="checkbox-row">
          <input
            defaultChecked={event?.is_opportunity_published}
            name="isOpportunityPublished"
            type="checkbox"
          />
          Publish this programme on the Opportunities page
        </label>
        <div className="form-field">
          <label htmlFor="opportunitySummary">Short summary</label>
          <textarea
            defaultValue={event?.opportunity_summary ?? ""}
            id="opportunitySummary"
            maxLength={500}
            name="opportunitySummary"
            placeholder="What volunteers will contribute and why it matters"
            rows={3}
          />
        </div>
        <div className="form-field">
          <label htmlFor="opportunityDescription">Full description</label>
          <textarea
            defaultValue={event?.opportunity_description ?? ""}
            id="opportunityDescription"
            maxLength={6000}
            name="opportunityDescription"
            placeholder="Role details, activities and what volunteers can expect"
            rows={6}
          />
        </div>
        <div className="form-field">
          <label htmlFor="opportunityCategory">Category</label>
          <input
            defaultValue={event?.opportunity_category ?? ""}
            id="opportunityCategory"
            maxLength={120}
            name="opportunityCategory"
            placeholder="Community event, mentoring, learning support…"
          />
        </div>
        <div className="form-field">
          <label>Card image</label>
          <input
            id="opportunityImageUrl"
            name="opportunityImageUrl"
            type="hidden"
            value={opportunityImageUrl}
          />
          {currentEventId ? (
            <EventImageUploader
              eventId={currentEventId}
              imageUrl={opportunityImageUrl || null}
              onImageChange={(url) => setOpportunityImageUrl(url ?? "")}
            />
          ) : (
            <p className="form-help">
              Create the programme first. You can then upload its opportunity image
              from this section.
            </p>
          )}
        </div>
        <div className="form-field">
          <label htmlFor="opportunityEligibility">Eligibility / requirements</label>
          <textarea
            defaultValue={event?.opportunity_eligibility ?? ""}
            id="opportunityEligibility"
            maxLength={2000}
            name="opportunityEligibility"
            placeholder="Age, skills, briefing or other participation requirements"
            rows={3}
          />
        </div>
        <div className="phaseone-admin-grid">
          <div className="form-field">
            <label htmlFor="registrationDeadline">Registration deadline</label>
            <input
              defaultValue={toSingaporeDateTimeLocal(event?.registration_deadline ?? null)}
              id="registrationDeadline"
              name="registrationDeadline"
              type="datetime-local"
            />
          </div>
          <div className="form-field">
            <label htmlFor="opportunitySortOrder">Display order</label>
            <input
              defaultValue={event?.opportunity_sort_order ?? ""}
              id="opportunitySortOrder"
              min={0}
              max={9999}
              name="opportunitySortOrder"
              type="number"
            />
          </div>
        </div>
      </fieldset>

      <TimeslotEditor initialTimeslots={effectiveInitialTimeslots} />

      <fieldset className="phaseone-admin-fieldset event-form-anchor" id="event-location">
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

      <fieldset className="phaseone-admin-fieldset event-form-anchor" id="event-preparation">
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

      <details className="phaseone-disclosure event-form-anchor" id="event-links">
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

      <details
        className="phaseone-disclosure event-form-anchor"
        id="event-attendance-settings"
        open={Boolean(event?.has_sign_in_pin || event?.has_sign_out_pin || event?.sign_in_url || event?.sign_out_url)}
      >
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

      <details className="phaseone-disclosure event-form-anchor" id="event-advanced">
        <summary>Advanced event settings</summary>
        <div className="phaseone-disclosure-body">
          <div className="form-field">
            <label htmlFor="slug">Public journey URL</label>
            <input
              autoCapitalize="none"
              id="slug"
              name="slug"
              onChange={(inputEvent) => {
                setSlugTouched(true);
                setSlug(inputEvent.currentTarget.value);
              }}
              placeholder="Generated from the event title"
              value={slug}
            />
          </div>
        </div>
      </details>

      <div className="phaseone-publish-row">
        <label className="checkbox-row">
          <input defaultChecked={event?.is_published} name="isPublished" type="checkbox" />
          Publish Event Guide to assigned volunteers
        </label>
        <p className="muted">Publishing needs a scheduled shift, venue and directions address. Other features are optional.</p>
      </div>

      {!event ? (
        <p className="muted phaseone-draft-status" aria-live="polite">
          {draftStatus === "saving"
            ? "Saving draft…"
            : draftStatus === "saved"
              ? draft
                ? "Recovered draft · changes autosave"
                : "Draft saved"
              : draftStatus === "error"
                ? "Draft autosave unavailable — keep this page open until saved."
                : "Changes will autosave as you work."}
        </p>
      ) : null}

      {saveState.status === "error" ? (
        <div className="notice notice-error" role="alert" aria-live="polite">{saveState.message}</div>
      ) : null}

      <div className="actions phaseone-sticky-actions">
        <button className="button button-primary" disabled={isSaving} type="submit">
          {isSaving
            ? event || recoveryEventId ? "Saving…" : "Creating…"
            : event || recoveryEventId ? "Save programme" : "Create programme"}
        </button>
      </div>
    </form>
  );
}
