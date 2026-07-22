import { saveEvent } from "@/app/admin/events/actions";

export type EventFormValue = Readonly<{
  id: string;
  external_opportunity_id: string | null;
  title: string;
  slug: string;
  reporting_at: string | null;
  venue: string | null;
  briefing_url: string | null;
  whatsapp_url: string | null;
  sign_in_url: string | null;
  sign_out_url: string | null;
  has_pin: boolean;
  is_published: boolean;
}>;

type OpportunityOption = Readonly<{
  id: string;
  title: string;
  starts_at: string | null;
}>;

function dateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

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
          <label htmlFor="title">Event title</label>
          <input defaultValue={event?.title} id="title" maxLength={160} name="title" required />
        </div>
        <div className="form-field">
          <label htmlFor="slug">Public URL slug</label>
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
          <label htmlFor="reportingAt">Reporting date and time</label>
          <input
            defaultValue={dateTimeLocal(event?.reporting_at ?? null)}
            id="reportingAt"
            name="reportingAt"
            type="datetime-local"
          />
        </div>
        <div className="form-field">
          <label htmlFor="venue">Venue</label>
          <input defaultValue={event?.venue ?? ""} id="venue" maxLength={240} name="venue" />
        </div>
      </div>

      <div className="phaseone-admin-grid">
        <div className="form-field">
          <label htmlFor="briefingUrl">Briefing URL</label>
          <input defaultValue={event?.briefing_url ?? ""} id="briefingUrl" name="briefingUrl" type="url" />
        </div>
        <div className="form-field">
          <label htmlFor="whatsappUrl">WhatsApp URL</label>
          <input defaultValue={event?.whatsapp_url ?? ""} id="whatsappUrl" name="whatsappUrl" type="url" />
        </div>
      </div>

      <fieldset className="phaseone-admin-fieldset">
        <legend>Attendance destinations</legend>
        <p className="muted">These URLs are never returned directly to the browser until a volunteer passes the event PIN.</p>
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

      <fieldset className="phaseone-admin-fieldset">
        <legend>Event PIN</legend>
        <div className="form-field">
          <label htmlFor="pin">{event?.has_pin ? "Set a new PIN" : "Set PIN"}</label>
          <input
            autoComplete="new-password"
            id="pin"
            inputMode="numeric"
            name="pin"
            pattern="[0-9]{4,8}"
            placeholder={event?.has_pin ? "Leave blank to keep current PIN" : "4 to 8 digits"}
            type="password"
          />
        </div>
        {event?.has_pin ? (
          <label className="checkbox-row">
            <input name="clearPin" type="checkbox" />
            Remove the current PIN and disable volunteer access
          </label>
        ) : null}
      </fieldset>

      <label className="checkbox-row">
        <input defaultChecked={event?.is_published} name="isPublished" type="checkbox" />
        Publish event page
      </label>
      <p className="muted">Publishing requires a PIN and both sign-in and sign-out URLs.</p>

      <div className="actions">
        <button className="button button-primary" type="submit">
          {event ? "Save event" : "Create event"}
        </button>
      </div>
    </form>
  );
}
