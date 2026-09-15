import { readFileSync, writeFileSync } from "node:fs";

function patch(path, replacements, append = "") {
  let source = readFileSync(path, "utf8");
  for (const [before, after] of replacements) {
    if (!source.includes(before)) throw new Error(`Expected source not found in ${path}: ${before.slice(0, 120)}`);
    source = source.replace(before, after);
  }
  if (append && !source.includes(append.trim().slice(0, 80))) source += append;
  writeFileSync(path, source);
}

patch("src/app/admin/events/[id]/attendance/page.tsx", [[
`            <Link className="button button-secondary" href={\`/admin/events/\${id}/edit\`}>Event settings / upload roster</Link>
            <a className="button button-secondary" href={\`/admin/events/\${id}/attendance/export\`}>Export attendance</a>`,
`            <Link className="button button-secondary" href={\`/admin/events/\${id}/edit\`}>Event settings / upload roster</Link>
            {selectedTimeslot ? (
              <>
                <Link className="button button-primary" href={\`/admin/events/\${id}/attendance/qr?timeslot=\${encodeURIComponent(selectedTimeslot.id)}&action=check_in\`}>Show check-in QR</Link>
                <Link className="button button-secondary" href={\`/admin/events/\${id}/attendance/qr?timeslot=\${encodeURIComponent(selectedTimeslot.id)}&action=check_out\`}>Show check-out QR</Link>
              </>
            ) : null}
            <a className="button button-secondary" href={\`/admin/events/\${id}/attendance/export\`}>Export attendance</a>`
]]);

patch("src/app/admin/events/[id]/report/export/route.ts", [
[
`type Review = {
  volunteer_person_key: string;
  rating: number;
  positive_behaviors: string[] | null;
  concern_behaviors: string[] | null;
  comment: string | null;
  follow_up_required: boolean;
  reviewed_at: string;
};`,
`type Review = {
  volunteer_person_key: string;
  rating: number;
  positive_behaviors: string[] | null;
  concern_behaviors: string[] | null;
  comment: string | null;
  follow_up_required: boolean;
  reviewed_at: string;
};

type Feedback = {
  volunteer_person_key: string;
  role_clarity: number;
  role_satisfaction: number;
  staff_support: number;
  recommend: number;
  suggestions: string | null;
  follow_up_requested: boolean;
  submitted_at: string;
};`
],
[
`    insightsResult,
    reviewsResult,
  ] = await Promise.all([`,
`    insightsResult,
    reviewsResult,
    feedbackResult,
  ] = await Promise.all([`
],
[
`    admin
      .from("phaseone_volunteer_reviews")
      .select("volunteer_person_key, rating, positive_behaviors, concern_behaviors, comment, follow_up_required, reviewed_at")
      .eq("event_id", id)
      .order("reviewed_at", { ascending: true })
      .limit(10000),
  ]);`,
`    admin
      .from("phaseone_volunteer_reviews")
      .select("volunteer_person_key, rating, positive_behaviors, concern_behaviors, comment, follow_up_required, reviewed_at")
      .eq("event_id", id)
      .order("reviewed_at", { ascending: true })
      .limit(10000),
    admin
      .from("phaseone_event_feedback")
      .select("volunteer_person_key, role_clarity, role_satisfaction, staff_support, recommend, suggestions, follow_up_requested, submitted_at")
      .eq("event_id", id)
      .limit(10000),
  ]);`
],
[
`  if (reviewsResult.error || !reviewsResult.data) {
    console.error("Event report export unavailable", { eventId: id, dataset: "reviews", code: reviewsResult.error?.code });
    return NextResponse.json({ error: "Event report export is unavailable." }, { status: 500 });
  }

  const timeslotById`,
`  if (reviewsResult.error || !reviewsResult.data) {
    console.error("Event report export unavailable", { eventId: id, dataset: "reviews", code: reviewsResult.error?.code });
    return NextResponse.json({ error: "Event report export is unavailable." }, { status: 500 });
  }
  if (feedbackResult.error || !feedbackResult.data) {
    console.error("Event report export unavailable", { eventId: id, dataset: "feedback", code: feedbackResult.error?.code });
    return NextResponse.json({ error: "Event report export is unavailable." }, { status: 500 });
  }

  const timeslotById`
],
[
`  const reviewsByPerson = groupByPersonKey(reviewsResult.data as Review[]);`,
`  const reviewsByPerson = groupByPersonKey(reviewsResult.data as Review[]);
  const feedbackByPerson = new Map((feedbackResult.data as Feedback[]).map((feedback) => [feedback.volunteer_person_key, feedback]));`
],
[
`    "follow_up_required",
  ];`,
`    "follow_up_required",
    "feedback_role_clarity",
    "feedback_role_satisfaction",
    "feedback_staff_support",
    "feedback_recommend",
    "feedback_suggestions",
    "feedback_follow_up_requested",
    "feedback_submitted_at",
  ];`
],
[
`    const reviews = reviewsByPerson.get(personKey) ?? [];
    const averageRating`,
`    const reviews = reviewsByPerson.get(personKey) ?? [];
    const feedback = feedbackByPerson.get(personKey);
    const averageRating`
],
[
`      reviews.some((review) => review.follow_up_required) ? "yes" : "no",
    ];`,
`      reviews.some((review) => review.follow_up_required) ? "yes" : "no",
      feedback ? String(feedback.role_clarity) : "",
      feedback ? String(feedback.role_satisfaction) : "",
      feedback ? String(feedback.staff_support) : "",
      feedback ? String(feedback.recommend) : "",
      feedback?.suggestions,
      feedback ? (feedback.follow_up_requested ? "yes" : "no") : "",
      feedback?.submitted_at,
    ];`
]
]);

patch("src/app/checkin.css", [], `

/* Volunteer QR attendance */
.attendance-qr-staff-page {
  max-width: 960px;
}

.attendance-qr-topbar,
.attendance-qr-shifts {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.attendance-qr-stage {
  margin: 1rem auto;
  max-width: 760px;
  text-align: center;
}

.attendance-qr-stage h1 {
  margin: 0.1rem 0;
  font-size: clamp(2.3rem, 8vw, 5rem);
  letter-spacing: 0.04em;
}

.attendance-qr-stage h2 {
  margin: 0.2rem 0;
}

.attendance-qr-presenter {
  display: grid;
  justify-items: center;
  gap: 0.7rem;
  margin: 1rem auto;
}

.attendance-qr-image {
  width: min(72vw, 520px);
  height: auto;
  background: white;
  border: 1px solid var(--border);
  border-radius: 0.8rem;
  padding: 0.5rem;
}

.attendance-qr-loading {
  display: grid;
  place-items: center;
  width: min(72vw, 520px);
  aspect-ratio: 1;
  border: 1px dashed var(--border);
  border-radius: 0.8rem;
}

.attendance-qr-expiry,
.attendance-qr-instruction {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.attendance-self-page {
  display: grid;
  place-items: start center;
  min-height: calc(100vh - 90px);
  padding-top: 2rem;
}

.attendance-self-card {
  width: min(100%, 620px);
  border: 1px solid var(--border);
  border-radius: 1rem;
  padding: clamp(1rem, 4vw, 1.5rem);
  background: var(--surface, white);
}

.attendance-self-card h1,
.attendance-self-card h2,
.attendance-self-card p {
  margin-top: 0;
}

.attendance-self-meta {
  color: var(--muted);
}

.attendance-self-confirm,
.attendance-self-identify,
.attendance-feedback-form {
  display: grid;
  gap: 1rem;
}

.attendance-self-primary {
  width: 100%;
  min-height: 3rem;
}

.attendance-self-help {
  margin-bottom: 0;
  font-size: 0.82rem;
}

.attendance-feedback-rating {
  border: 0;
  padding: 0;
  margin: 0;
}

.attendance-feedback-rating legend {
  margin-bottom: 0.5rem;
  font-weight: 750;
}

.attendance-feedback-scale {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.45rem;
}

.attendance-feedback-scale label {
  position: relative;
}

.attendance-feedback-scale input {
  position: absolute;
  opacity: 0;
}

.attendance-feedback-scale span {
  display: grid;
  place-items: center;
  min-height: 2.8rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  font-weight: 800;
  cursor: pointer;
}

.attendance-feedback-scale input:checked + span {
  outline: 2px solid currentColor;
  background: var(--surface-subtle, #f6f8f7);
}

.attendance-feedback-scale-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 0.25rem;
  color: var(--muted);
  font-size: 0.74rem;
}

.attendance-feedback-followup {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
}

.attendance-feedback-followup input {
  margin-top: 0.2rem;
}

.attendance-complete-card {
  text-align: center;
}

.attendance-complete-mark {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  margin: 0 auto 1rem;
  border-radius: 999px;
  border: 2px solid currentColor;
  font-size: 2rem;
  font-weight: 900;
}

@media (max-width: 640px) {
  .attendance-self-page {
    padding-top: 0.75rem;
  }

  .attendance-self-card {
    border-radius: 0.75rem;
  }

  .attendance-qr-topbar .actions,
  .attendance-qr-shifts {
    width: 100%;
  }

  .attendance-qr-topbar .button,
  .attendance-qr-shifts .button {
    flex: 1;
  }
}
`);
