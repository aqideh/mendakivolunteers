from pathlib import Path

attendance_path = Path('src/app/admin/events/[id]/attendance/page.tsx')
attendance = attendance_path.read_text()

old_import = 'import { addVolunteerInsight } from "@/app/admin/events/[id]/insights/actions";\n'
new_import = old_import + 'import { VolunteerReviewForm } from "@/components/phaseone/volunteer-review-form";\nimport { WalkInEditForm } from "@/components/phaseone/walk-in-edit-form";\n'
if 'VolunteerReviewForm' not in attendance:
    assert old_import in attendance, 'attendance insight import not found'
    attendance = attendance.replace(old_import, new_import, 1)

old_success = '''          : successCode === "insight_saved"
            ? "Volunteer insight saved for review."
            : undefined;'''
new_success = '''          : successCode === "insight_saved"
            ? "Volunteer insight saved for review."
            : successCode === "review_saved"
              ? "Volunteer review saved."
              : successCode === "walk_in_updated"
                ? "Walk-in volunteer details updated."
                : undefined;'''
if 'successCode === "review_saved"' not in attendance:
    assert old_success in attendance, 'attendance success message block not found'
    attendance = attendance.replace(old_success, new_success, 1)

marker = '                      <details className="phaseone-inline-insight">\n'
insert = '''                      <VolunteerReviewForm
                        eventId={id}
                        rosterId={volunteer.id}
                        timeslotId={selectedTimeslot.id}
                      />

                      {volunteer.entry_method === "walk_in" ? (
                        <WalkInEditForm
                          email={volunteer.email}
                          eventId={id}
                          mobile={volunteer.mobile}
                          rosterId={volunteer.id}
                          timeslotId={selectedTimeslot.id}
                          volunteerName={volunteer.volunteer_name}
                        />
                      ) : null}

'''
if '<VolunteerReviewForm' not in attendance:
    assert marker in attendance, 'attendance inline insight marker not found'
    attendance = attendance.replace(marker, insert + marker, 1)

attendance_path.write_text(attendance)

insights_path = Path('src/app/admin/events/[id]/insights/page.tsx')
insights = insights_path.read_text()

portal_import = 'import { PortalHeader } from "@/components/portal-header";\n'
reviews_import = portal_import + 'import { VolunteerReviewsSection } from "@/components/phaseone/volunteer-reviews-section";\n'
if 'VolunteerReviewsSection' not in insights:
    assert portal_import in insights, 'insights PortalHeader import not found'
    insights = insights.replace(portal_import, reviews_import, 1)

capture_nav = '            <a className="compact-section-index-link" href="#capture">Capture <span className="compact-section-index-count">{volunteers.length}</span></a>\n'
review_nav = capture_nav + '            <a className="compact-section-index-link" href="#reviews">Reviews</a>\n'
if 'href="#reviews"' not in insights:
    assert capture_nav in insights, 'insights capture navigation not found'
    insights = insights.replace(capture_nav, review_nav, 1)

review_section = '        <section className="compact-section" id="review" aria-labelledby="review-title">\n'
if '<VolunteerReviewsSection eventId={id} />' not in insights:
    assert review_section in insights, 'insights review section marker not found'
    insights = insights.replace(review_section, '        <VolunteerReviewsSection eventId={id} />\n\n' + review_section, 1)

insights_path.write_text(insights)

css_path = Path('src/app/volunteer-insights.css')
css = css_path.read_text()
styles = r'''

.phaseone-volunteer-review,
.phaseone-walk-in-edit {
  margin-top: 0.65rem;
  border-top: 1px solid var(--border);
}

.phaseone-volunteer-review > summary,
.phaseone-walk-in-edit > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.62rem 0 0;
  cursor: pointer;
  list-style: none;
  font-size: 0.82rem;
  font-weight: 800;
}

.phaseone-volunteer-review > summary::-webkit-details-marker,
.phaseone-walk-in-edit > summary::-webkit-details-marker {
  display: none;
}

.phaseone-volunteer-review-hint {
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 650;
}

.volunteer-review-form,
.phaseone-walk-in-edit-form {
  display: grid;
  gap: 0.8rem;
  padding: 0.8rem 0 0.2rem;
}

.volunteer-review-fieldset {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.volunteer-review-fieldset legend {
  padding: 0;
  font-size: 0.8rem;
  font-weight: 800;
}

.volunteer-review-fieldset .muted {
  margin: 0;
}

.volunteer-review-rating-options {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.4rem;
}

.volunteer-review-rating {
  display: grid;
  gap: 0.18rem;
  min-width: 0;
  padding: 0.55rem;
  border: 1px solid var(--border);
  border-radius: 0.7rem;
  cursor: pointer;
  font-size: 0.72rem;
}

.volunteer-review-rating:has(input:checked) {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}

.volunteer-review-stars {
  white-space: nowrap;
  font-size: 0.86rem;
  letter-spacing: 0.02em;
}

.volunteer-review-tags,
.volunteer-review-history-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.volunteer-review-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.15rem;
  padding: 0.38rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.75rem;
}

.volunteer-review-tag:has(input:checked) {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}

.volunteer-review-follow-up {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.65rem;
  border: 1px solid var(--border);
  border-radius: 0.7rem;
  cursor: pointer;
}

.volunteer-review-follow-up > span {
  display: grid;
  gap: 0.15rem;
}

.volunteer-review-follow-up small {
  color: var(--muted);
  line-height: 1.35;
}

.phaseone-walk-in-edit-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
}

.volunteer-review-history {
  border-top: 1px solid var(--border);
}

.volunteer-review-history-person {
  border-bottom: 1px solid var(--border);
}

.volunteer-review-history-person > summary {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 0;
  cursor: pointer;
  list-style: none;
}

.volunteer-review-history-person > summary::-webkit-details-marker {
  display: none;
}

.volunteer-review-history-person > summary > span {
  display: grid;
  gap: 0.1rem;
}

.volunteer-review-history-person small,
.volunteer-review-history-score small {
  color: var(--muted);
  font-size: 0.72rem;
}

.volunteer-review-history-score {
  flex: 0 0 auto;
  text-align: right;
}

.volunteer-review-history-entries {
  display: grid;
  gap: 0.7rem;
  padding: 0 0 0.9rem;
}

.volunteer-review-history-entry {
  display: grid;
  gap: 0.45rem;
  padding: 0.7rem;
  border: 1px solid var(--border);
  border-radius: 0.7rem;
}

.volunteer-review-history-entry p {
  margin: 0;
  line-height: 1.45;
}

.volunteer-review-history-entry-heading {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: baseline;
}

.volunteer-review-history-tag {
  display: inline-flex;
  padding: 0.25rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.7rem;
}

.volunteer-review-history-tag-concern,
.volunteer-review-follow-up-flag {
  font-weight: 750;
}

.volunteer-review-follow-up-flag {
  font-size: 0.75rem;
}

@media (max-width: 760px) {
  .volunteer-review-rating-options,
  .phaseone-walk-in-edit-grid {
    grid-template-columns: 1fr;
  }

  .volunteer-review-rating {
    grid-template-columns: auto 1fr;
    align-items: center;
  }

  .volunteer-review-rating input {
    grid-row: span 2;
  }

  .volunteer-review-history-person > summary {
    align-items: start;
  }
}
'''
if '.phaseone-volunteer-review {' not in css:
    css_path.write_text(css.rstrip() + styles + '\n')
