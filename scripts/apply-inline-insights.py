from pathlib import Path

page_path = Path('src/app/admin/events/[id]/attendance/page.tsx')
page = page_path.read_text()

old_import = '''import {
  addWalkInVolunteer,
  applyAttendanceChange,
} from "@/app/admin/events/[id]/attendance/actions";
'''
new_import = old_import + 'import { addVolunteerInsight } from "@/app/admin/events/[id]/insights/actions";\n'
if old_import in page and 'import { addVolunteerInsight }' not in page:
    page = page.replace(old_import, new_import, 1)

old_success = '''        : successCode === "walk_in_added"
          ? "Last-minute volunteer added to the roster."
          : undefined;'''
new_success = '''        : successCode === "walk_in_added"
          ? "Last-minute volunteer added to the roster."
          : successCode === "insight_saved"
            ? "Volunteer insight saved for review."
            : undefined;'''
if old_success in page:
    page = page.replace(old_success, new_success, 1)

marker = '''                      {status === "anomaly" ? <p className="notice notice-error">Check-out exists without a check-in timestamp.</p> : null}\n'''
inline = '''                      <details className="phaseone-inline-insight">
                        <summary>
                          <span>+ Add insight</span>
                          <span className="phaseone-inline-insight-hint">Skill, interest, connection, etc.</span>
                        </summary>
                        <form action={addVolunteerInsight} className="insight-capture-form phaseone-inline-insight-form">
                          <input name="eventId" type="hidden" value={id} />
                          <input name="rosterId" type="hidden" value={volunteer.id} />
                          <input name="timeslotId" type="hidden" value={selectedTimeslot.id} />
                          <div className="insight-capture-grid">
                            <div className="form-field">
                              <label htmlFor={`insight-category-${volunteer.id}`}>What did you learn?</label>
                              <select id={`insight-category-${volunteer.id}`} name="category" defaultValue="interest">
                                <option value="interest">Interest</option>
                                <option value="skill">Skill</option>
                                <option value="experience">Experience</option>
                                <option value="connection">Connection / affiliation</option>
                                <option value="role_preference">Role preference</option>
                                <option value="availability">Availability</option>
                                <option value="language">Language</option>
                                <option value="development">Development interest</option>
                                <option value="follow_up">Follow-up</option>
                                <option value="note">Other useful note</option>
                              </select>
                            </div>
                            <div className="form-field">
                              <label htmlFor={`insight-source-${volunteer.id}`}>Source</label>
                              <select id={`insight-source-${volunteer.id}`} name="sourceType" defaultValue="volunteer_shared">
                                <option value="volunteer_shared">Volunteer told me</option>
                                <option value="staff_observed">Staff observed</option>
                              </select>
                            </div>
                          </div>
                          <div className="form-field">
                            <label htmlFor={`insight-value-${volunteer.id}`}>Insight</label>
                            <input
                              id={`insight-value-${volunteer.id}`}
                              name="value"
                              maxLength={240}
                              placeholder="e.g. Interested in mentoring, photography, weekends"
                              required
                            />
                          </div>
                          <div className="form-field">
                            <label htmlFor={`insight-detail-${volunteer.id}`}>Context <span className="muted">optional</span></label>
                            <textarea
                              id={`insight-detail-${volunteer.id}`}
                              name="detail"
                              maxLength={1500}
                              rows={2}
                              placeholder="Short factual context that will help someone understand this later"
                            />
                          </div>
                          <div className="phaseone-inline-insight-actions">
                            <button className="button button-primary" type="submit">Save insight</button>
                            <Link className="text-link" href={`/admin/events/${id}/insights`}>Review all insights</Link>
                          </div>
                        </form>
                      </details>

'''
if marker in page and 'phaseone-inline-insight' not in page:
    page = page.replace(marker, inline + marker, 1)
page_path.write_text(page)

actions_path = Path('src/app/admin/events/[id]/insights/actions.ts')
actions = actions_path.read_text()
old_redirect = '''  revalidatePath(attendancePath);
  revalidatePath(`/admin/events/${parsed.data.eventId}/insights`);
  redirect(`${attendancePath}?success=insight_saved&highlight=${encode(parsed.data.rosterId)}`);
'''
new_redirect = '''  revalidatePath(attendancePath);
  revalidatePath(`/admin/events/${parsed.data.eventId}/insights`);
  const returnTimeslotId = parsed.data.timeslotId ?? roster.timeslot_id;
  const returnQuery = new URLSearchParams({
    success: "insight_saved",
    highlight: parsed.data.rosterId,
  });
  if (returnTimeslotId) returnQuery.set("timeslot", returnTimeslotId);
  redirect(`${attendancePath}?${returnQuery.toString()}#roster-${encode(parsed.data.rosterId)}`);
'''
if old_redirect in actions:
    actions = actions.replace(old_redirect, new_redirect, 1)
actions_path.write_text(actions)

css_path = Path('src/app/volunteer-insights.css')
css = css_path.read_text()
addition = '''

.phaseone-inline-insight {
  margin-top: 0.7rem;
  border-top: 1px solid var(--border);
}

.phaseone-inline-insight > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0 0;
  cursor: pointer;
  list-style: none;
  color: var(--ink);
  font-size: 0.82rem;
  font-weight: 800;
}

.phaseone-inline-insight > summary::-webkit-details-marker {
  display: none;
}

.phaseone-inline-insight-hint {
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 650;
  text-align: right;
}

.phaseone-inline-insight-form {
  padding: 0.75rem 0 0.15rem;
}

.phaseone-inline-insight-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.phaseone-inline-insight-actions .button {
  justify-self: auto;
}

@media (max-width: 760px) {
  .phaseone-inline-insight > summary {
    padding-top: 0.58rem;
  }

  .phaseone-inline-insight-hint {
    max-width: 10rem;
  }

  .phaseone-inline-insight-form {
    gap: 0.6rem;
  }

  .phaseone-inline-insight-actions {
    justify-content: space-between;
  }
}
'''
if '.phaseone-inline-insight {' not in css:
    css_path.write_text(css.rstrip() + addition + '\n')
