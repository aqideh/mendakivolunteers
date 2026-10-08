"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { saveEvent } from "@/app/admin/events/actions";
import { saveEventFormDraft } from "@/app/admin/events/draft-actions";
import { toSingaporeDateTimeLocal } from "@/lib/content/dates";

import { EventImageUploader } from "./event-image-uploader";
import { TimeslotEditor, type TimeslotEditorValue } from "./timeslot-editor";

type SetupStepKey = "details" | "shifts" | "location" | "preparation" | "visibility";

function SetupStep({
  id, title, summary, expanded, onToggle, children,
}: {
  id: string;
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="km-setup-section event-form-anchor" id={id}>
      <button
        aria-controls={`${id}-fields`}
        aria-expanded={expanded}
        className="km-setup-section-toggle"
        onClick={onToggle}
        type="button"
      >
        <span className="km-setup-section-title">{title}</span>
        <span className="km-setup-section-summary">{summary}</span>
        <span className="km-setup-section-edit">{expanded ? "Close" : "Edit"}</span>
      </button>
      <div className="km-setup-section-body" hidden={!expanded} id={`${id}-fields`}>
        {children}
      </div>
    </section>
  );
}

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
  self_attendance_enabled: boolean;
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
  const router = useRouter();
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
  const [dirty, setDirty] = useState(false);
  const [summaryPreview, setSummaryPreview] = useState(event?.opportunity_summary ?? draftString(draft, "opportunitySummary"));
  const [titlePreview, setTitlePreview] = useState(event?.title ?? draftString(draft, "title"));
  const [venuePreview, setVenuePreview] = useState(event?.venue ?? draftString(draft, "venue"));
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [categoryPreview, setCategoryPreview] = useState(event?.opportunity_category ?? draftString(draft, "opportunityCategory"));
  const [directionsPreview, setDirectionsPreview] = useState(event?.navigation_destination ?? draftString(draft, "navigationDestination"));
  const [attirePreview, setAttirePreview] = useState(event?.attire_notes ?? (draftString(draft, "attireNotes") || defaultAttireNotes));
  const [preparationPreview, setPreparationPreview] = useState(event?.preparation_notes ?? draftString(draft, "preparationNotes"));
  const [opportunityPublishedPreview, setOpportunityPublishedPreview] = useState(event?.is_opportunity_published ?? (draft?.payload.isOpportunityPublished === true));
  const [guidePublishedPreview, setGuidePublishedPreview] = useState(event?.is_published ?? (draft?.payload.isPublished === true));
  const [shiftPreview, setShiftPreview] = useState<TimeslotEditorValue[]>(effectiveInitialTimeslots);
  const firstIncompleteStep: SetupStepKey =
    !titlePreview.trim() || !summaryPreview.trim() ? "details"
    : !effectiveInitialTimeslots.some((slot) => slot.startsAt && slot.status === "scheduled") ? "shifts"
    : !venuePreview.trim() || !directionsPreview.trim() ? "location"
    : !preparationPreview.trim() ? "preparation"
    : "visibility";
  const [expandedStep, setExpandedStep] = useState<SetupStepKey | null>(firstIncompleteStep);
  const [focusedStep, setFocusedStep] = useState<SetupStepKey>(firstIncompleteStep);
  const currentEventId = event?.id ?? recoveryEventId;

  const setupSteps: { key: SetupStepKey; id: string; title: string; done: boolean }[] = [
    { key: "details", id: "event-schedule", title: "Details", done: Boolean(titlePreview.trim() && summaryPreview.trim()) },
    { key: "shifts", id: "event-shifts", title: "Schedule & shifts", done: shiftPreview.some((slot) => Boolean(slot.startsAt) && slot.status === "scheduled") },
    { key: "location", id: "event-location", title: "Location", done: Boolean(venuePreview.trim() && directionsPreview.trim()) },
    { key: "preparation", id: "event-preparation", title: "Volunteer prep", done: Boolean(attirePreview.trim() && preparationPreview.trim()) },
    { key: "visibility", id: "event-visibility", title: "Visibility", done: true },
  ];

  function openStep(step: SetupStepKey, shouldScroll = false) {
    setExpandedStep(step);
    setFocusedStep(step);
    if (shouldScroll) {
      requestAnimationFrame(() => {
        const id = setupSteps.find((item) => item.key === step)?.id;
        if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  useEffect(() => {
    const ids: Record<string, SetupStepKey> = {
      "event-schedule": "details", "event-opportunity": "details", "event-shifts": "shifts",
      "event-location": "location", "event-preparation": "preparation",
      "event-links": "preparation", "event-attendance-settings": "preparation",
      "event-advanced": "preparation", "event-visibility": "visibility",
    };
    const onScroll = () => {
      const match = Object.entries(ids).filter(([id]) => id.startsWith("event-") && !["event-opportunity","event-links","event-attendance-settings","event-advanced"].includes(id)).find(([id]) => {
        const bounds = document.getElementById(id)?.getBoundingClientRect();
        return bounds && bounds.top <= 200 && bounds.bottom > 180;
      });
      if (match) setFocusedStep((prev) => prev === match[1] ? prev : match[1]);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    payload.selfAttendanceEnabled =
      (form.elements.namedItem("selfAttendanceEnabled") as HTMLInputElement | null)?.checked ?? false;
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

    const formData = new FormData(form);
    if (!event?.id && recoveryEventId) formData.set("id", recoveryEventId);

    setSaveState({ status: "idle", message: "" });
    startSaving(async () => {
      try {
        const result = await saveEvent(formData);
        if (result.status === "error") {
          if (!event?.id && result.eventId) setRecoveryEventId(result.eventId);
          setSaveState({ status: "error", message: result.message });
          return;
        }

        router.replace(result.redirectTo);
        router.refresh();
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
    <form className="phaseone-admin-form km-programme-form" noValidate
      onChange={(e) => {
        scheduleAutosave(); setDirty(true);
        const control = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (control.name === "title") setTitlePreview(control.value);
        if (control.name === "opportunitySummary") setSummaryPreview(control.value);
        if (control.name === "venue") setVenuePreview(control.value);
        if (control.name === "opportunityCategory") setCategoryPreview(control.value);
        if (control.name === "navigationDestination") setDirectionsPreview(control.value);
        if (control.name === "attireNotes") setAttirePreview(control.value);
        if (control.name === "preparationNotes") setPreparationPreview(control.value);
        if (control.name === "isOpportunityPublished") setOpportunityPublishedPreview(control.checked);
        if (control.name === "isPublished") setGuidePublishedPreview(control.checked);
      }} onInput={scheduleAutosave} onSubmit={handleSubmit} ref={formRef}>
      {event?.id || recoveryEventId ? <input name="id" type="hidden" value={event?.id ?? recoveryEventId ?? ""} /> : null}
      <div className="km-setup-layout">
        <aside className="km-setup-steps" aria-label="Programme setup steps">
          <h2>Setup progress</h2>
          <nav aria-label="Jump to setup section">
            {setupSteps.map((step,index) => (
              <button type="button" className="km-setup-step-button" data-active={focusedStep===step.key}
                aria-current={focusedStep===step.key ? "step" : undefined}
                aria-label={`Step ${index+1}: ${step.title}, ${step.done ? "configured" : "needs attention"}`}
                onClick={() => openStep(step.key,true)} key={step.key}>
                <span aria-hidden="true">{step.done ? "✓" : index+1}</span>{step.title}
              </button>
            ))}
          </nav>
        </aside>
        <div className="km-setup-fields">
          <SetupStep id="event-schedule" title="Details" expanded={expandedStep==="details"}
            summary={`${categoryPreview || "No category"} · ${opportunityImageUrl ? "1 image" : "No image"} · ${summaryPreview ? "Summary added" : "Summary needed"}`}
            onToggle={() => setExpandedStep(expandedStep==="details" ? null : "details")}>
<div className="form-field">
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

      <div className="km-editor-listing" id="event-opportunity">
        <h3>Opportunity listing</h3>
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
        
        <div className="km-editor-two km-editor-category-deadline">
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
            <label htmlFor="registrationDeadline">Registration deadline</label>
            <input
              defaultValue={toSingaporeDateTimeLocal(event?.registration_deadline ?? null)}
              id="registrationDeadline"
              name="registrationDeadline"
              type="datetime-local"
            />
          </div>
        </div>
        <div className="form-field km-editor-image">
          <label>Card image</label>
          <input
            id="opportunityImageUrl"
            name="opportunityImageUrl"
            type="hidden"
            value={opportunityImageUrl}
          />
          {currentEventId ? (
            <EventImageUploader
              compact
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
            <label htmlFor="opportunitySortOrder">Display order (lower numbers appear first)</label>
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
      </div>

          </SetupStep>
          <SetupStep id="event-shifts" title="Schedule & shifts" expanded={expandedStep==="shifts"}
            summary={`${shiftPreview.length || 1} shift(s) · ${shiftPreview.filter(s=>s.startsAt && s.status==="scheduled").length} scheduled`}
            onToggle={() => setExpandedStep(expandedStep==="shifts" ? null : "shifts")}>
            <TimeslotEditor initialTimeslots={effectiveInitialTimeslots} onChange={timeslots=>{setShiftPreview(timeslots);setDirty(true);scheduleAutosave();}} />
          </SetupStep>
          <SetupStep id="event-location" title="Location" expanded={expandedStep==="location"}
            summary={`${venuePreview || "Venue needed"} · ${directionsPreview ? "Directions added" : "Address needed"}`}
            onToggle={() => setExpandedStep(expandedStep==="location" ? null : "location")}>
<div className="km-editor-two">
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
      </div>
          </SetupStep>
          <SetupStep id="event-preparation" title="Volunteer preparation" expanded={expandedStep==="preparation"}
            summary={`${attirePreview ? "Attire reminder" : "Attire needed"} · ${preparationPreview ? "Instructions added" : "Instructions needed"}`}
            onToggle={() => setExpandedStep(expandedStep==="preparation" ? null : "preparation")}>
<div className="km-editor-two">
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
      </div>
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
        open={Boolean(event?.sign_in_url || event?.sign_out_url || event?.self_attendance_enabled)}
      >
        <summary>Attendance settings</summary>
        <div className="phaseone-disclosure-body">
          <label className="checkbox-row">
            <input
              defaultChecked={event?.self_attendance_enabled ?? false}
              name="selfAttendanceEnabled"
              type="checkbox"
            />
            Enable self-attendance mode
          </label>
          <p className="form-help">
            Use this for events where volunteers may need to mark their own attendance because no staff are present.
          </p>
          <p className="muted">Optional links for volunteer check-in and check-out. PINs are no longer used.</p>
          <div className="phaseone-admin-grid">
            <div className="form-field">
              <label htmlFor="signInUrl">Check-in URL</label>
              <input defaultValue={event?.sign_in_url ?? ""} id="signInUrl" name="signInUrl" type="url" />
            </div>
            <div className="form-field">
              <label htmlFor="signOutUrl">Check-out URL</label>
              <input defaultValue={event?.sign_out_url ?? ""} id="signOutUrl" name="signOutUrl" type="url" />
            </div>
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

      
          </SetupStep>
          <SetupStep id="event-visibility" title="Visibility" expanded={expandedStep==="visibility"}
            summary={`${opportunityPublishedPreview ? "On Opportunities" : "Not on Opportunities"} · ${guidePublishedPreview ? "Guide shared" : "Guide private"}`}
            onToggle={() => setExpandedStep(expandedStep==="visibility" ? null : "visibility")}>
            <div className="km-editor-visibility">
              <label className="checkbox-row"><input defaultChecked={event?.is_opportunity_published ?? false} name="isOpportunityPublished" type="checkbox"/>Show on Opportunities page</label>
              <label className="checkbox-row"><input defaultChecked={event?.is_published ?? false} name="isPublished" type="checkbox"/>Share Event Guide with assigned volunteers</label>
              <p className="form-help">Publishing requires a scheduled shift, venue and directions address.</p>
            </div>
          </SetupStep>
        </div>
        <aside className="km-setup-preview">
          <div className="km-preview-heading"><h2>Live preview</h2><button type="button" className="button button-secondary km-preview-mobile-button"
            aria-expanded={showMobilePreview} aria-controls="km-live-preview" onClick={()=>setShowMobilePreview(!showMobilePreview)}>{showMobilePreview?"Hide preview":"Preview"}</button></div>
          <div id="km-live-preview" className={showMobilePreview?"km-setup-preview-content is-open":"km-setup-preview-content"}>
            {opportunityImageUrl ? <img alt="" src={opportunityImageUrl}/> : <div className="km-preview-image-placeholder">Opportunity image</div>}
            <span className="status-pill">{opportunityPublishedPreview ? "Shown on Opportunities" : "Not yet public"}</span>
            <strong>{titlePreview || "Programme title"}</strong><span className="muted">{categoryPreview}</span>
            <p>{summaryPreview || "Public summary preview"}</p><p className="muted">{venuePreview || "Location to be confirmed"}</p>
          </div>
        </aside>
      </div>
      {!event ? <p className="muted phaseone-draft-status" aria-live="polite">{draftStatus==="saving"?"Saving draft…":draftStatus==="saved"?"Draft saved":draftStatus==="error"?"Draft autosave unavailable. Save manually.":"Changes autosave as you work."}</p> : null}
      {saveState.status==="error" ? <div className="notice notice-error" role="alert">{saveState.message}</div> : null}
      <div className="actions phaseone-sticky-actions km-setup-save-bar">
        <span role="status" className="km-setup-save-label">{isSaving ? "Saving…" : dirty ? "Unsaved changes" : event ? "No unsaved changes" : "Draft programme"}</span>
        <button className="button button-primary" disabled={isSaving} type="submit">{isSaving?"Saving…":event||recoveryEventId?"Save programme":"Create programme"}</button>
      </div>
    </form>
  );
}