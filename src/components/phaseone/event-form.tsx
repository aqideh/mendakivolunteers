import { saveEvent } from "@/app/admin/events/actions";
import { toSingaporeDateTimeLocal } from "@/lib/content/dates";

export type EventFormValue = Readonly<{
  id: string;
  external_opportunity_id: string | null;
  title: string;
  slug: string;
  reporting_at: string | null;
  venue: string | null;
  briefing_url: string | null;
  briefing_available_at: string | null;
  whatsapp_url: string | null;
  sign_in_url: string | null;
  sign_out_url: string | null;
  has_sign_in_pin: boolean;
  has_sign_out_pin: boolean;
  is_published: boolean;
}>;

type OpportunityOption = Readonly<{
  id: string;
  title: string;
  starts_at: string | null;
}>;

export function EventForm({
  event,
  opportunities,
}: {
  event?: EventFormValue;
  opportunities: readonly OpportunityOption[];
}) {
  return (
    <form action={saveEvent} className="phaseone-admin-form">
      {event ? <input name="id" type="hidden" value={event.id} /> : null}

      <div className="form-field">
        <label htmlFor="externalOpportunityId">Volunteer.gov.sg opportunity</label>
        <select
          defaultValue={event?.external_opportunity_id ?? ""}
          id="externalOpportunityId"
          name="externalOpportunityId"
        >
          <option value="">No linked opportunity</option>
          {opportunities.map((opportunity) => (
            <option key={opportunity.id} value={opportunity.id}>
              {opportunity.title}
            </option>
          ))}
        </select>
      </div>

      <div className="phaseone-admin-grid">
        <div className="form-field">
          <label htmlFor="title">Package title</label>
          <input defaultValue={event?.title} id="title" maxLength={160} name="title" required />
        </div>
        <div className="form-field">
          <label htmlFor="slug">Public package URL slug</label>
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

      <div className="phaseone-admin-grid">
        <div className="form-field">
          <label htmlFor="reportingAt">Reporting date and time (Singapore)</label>
          <input
            defaultValue={toSingaporeDateTimeLocal(event?.reporting_at ?? null)}
            id="reportingAt"
            name="reportingAt"
            type="datetime-local"
          />
          <p className="muted">Published packages cannot use a reporting date before today.</p>
        </div>
        <div className="form-field">
          <label htmlFor="venue">Venue</label>
          <input defaultValue={event?.venue ?? ""} id="venue" maxLength={240} name="venue" />
        </div>
      </div>

      <fieldset className="phaseone-admin-fieldset">
        <legend>Briefing</legend>
        <p className="muted">The destination remains server-only until the configured release time.</p>
        <div className="phaseone-admin-grid">
          <div className="form-field">
            <label htmlFor="briefingUrl">Briefing URL</label>
            <input defaultValue={event?.briefing_url ?? ""} id="briefingUrl" name="briefingUrl" type="url" />
          </div>
          <div className="form-field">
            <label htmlFor="briefingAvailableAt">Briefing release (Singapore)</label>
            <input
              defaultValue={toSingaporeDateTimeLocal(event?.briefing_available_at ?? null)}
              id="briefingAvailableAt"
              name="briefingAvailableAt"
              type="datetime-local"
            />
          </div>
        </div>
      </fieldset>

      <div className="form-field">
        <label htmlFor="whatsappUrl">WhatsApp URL</label>
        <input defaultValue={event?.whatsapp_url ?? ""} id="whatsappUrl" name="whatsappUrl" type="url" />
      </div>

      <fieldset className="phaseone-admin-fieldset">
        <legend>Attendance destinations</legend>
        <p className="muted">Each destination is exposed only after its matching PIN is verified.</p>
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
      </fieldset>

      <div className="phaseone-admin-grid">
        <fieldset className="phaseone-admin-fieldset">
          <legend>Sign-in PIN</legend>
          <div className="form-field">
            <label htmlFor="signInPin">{event?.has_sign_in_pin ? "Set a new sign-in PIN" : "Set sign-in PIN"}</label>
            <input
              autoComplete="new-password"
              id="signInPin"
              inputMode="numeric"
              name="signInPin"
              pattern="[0-9]{4,8}"
              placeholder={event?.has_sign_in_pin ? "Leave blank to keep current PIN" : "4 to 8 digits"}
              type="password"
            />
          </div>
          {event?.has_sign_in_pin ? (
            <label className="checkbox-row">
              <input name="clearSignInPin" type="checkbox" />
              Remove sign-in PIN
            </label>
          ) : null}
        </fieldset>

        <fieldset className="phaseone-admin-fieldset">
          <legend>Sign-out PIN</legend>
          <div className="form-field">
            <label htmlFor="signOutPin">{event?.has_sign_out_pin ? "Set a new sign-out PIN" : "Set sign-out PIN"}</label>
            <input
              autoComplete="new-password"
              id="signOutPin"
              inputMode="numeric"
              name="signOutPin"
              pattern="[0-9]{4,8}"
              placeholder={event?.has_sign_out_pin ? "Leave blank to keep current PIN" : "4 to 8 digits"}
              type="password"
            />
          </div>
          {event?.has_sign_out_pin ? (
            <label className="checkbox-row">
              <input name="clearSignOutPin" type="checkbox" />
              Remove sign-out PIN
            </label>
          ) : null}
        </fieldset>
      </div>

      <label className="checkbox-row">
        <input defaultChecked={event?.is_published} name="isPublished" type="checkbox" />
        Publish volunteer package
      </label>
      <p className="muted">
        Publishing requires a current or future reporting date, both attendance URLs and both action PINs. Briefing URL and release time must be set together.
      </p>

      <div className="actions">
        <button className="button button-primary" type="submit">
          {event ? "Save package" : "Create package"}
        </button>
      </div>
    </form>
  );
}
