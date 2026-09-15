import { NextResponse } from "next/server";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { csvCell } from "@/lib/security/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

type Timeslot = {
  id: string;
  label: string | null;
  starts_at: string;
  ends_at: string | null;
};

type Insight = {
  volunteer_person_key: string;
  category: string;
  value: string;
  detail: string | null;
  source_type: string;
  review_status: string;
  captured_at: string;
  reviewed_at: string | null;
};

type Review = {
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
};

function singaporeDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function singaporeTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function shiftLabel(timeslot: Timeslot): string {
  if (timeslot.label?.trim()) return timeslot.label.trim();
  const start = singaporeTime(timeslot.starts_at);
  const end = timeslot.ends_at ? singaporeTime(timeslot.ends_at) : null;
  return end ? `${start}-${end}` : start;
}

function safeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "event";
}

function attendanceStatus(attendance: {
  signed_in_at: string | null;
  signed_out_at: string | null;
  non_attendance_status: string | null;
} | undefined): string {
  if (attendance?.non_attendance_status === "withdrawn") return "withdrawn";
  if (attendance?.non_attendance_status === "absent") return "absent";
  if (attendance?.signed_out_at) {
    return attendance.signed_in_at ? "checked_out" : "anomaly_check_out_without_check_in";
  }
  return attendance?.signed_in_at ? "checked_in" : "not_arrived";
}

function groupByPersonKey<T extends { volunteer_person_key: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const current = grouped.get(item.volunteer_person_key) ?? [];
    current.push(item);
    grouped.set(item.volunteer_person_key, current);
  }
  return grouped;
}

function uniqueSorted(values: string[]): string {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right)).join(" | ");
}

function insightText(insights: Insight[]): string {
  return insights.map((insight) => {
    const detail = insight.detail?.trim() ? ` — ${insight.detail.trim()}` : "";
    return `[${insight.review_status}] ${insight.category}: ${insight.value} (${insight.source_type})${detail}`;
  }).join(" || ");
}

function reviewComments(reviews: Review[]): string {
  return reviews
    .filter((review) => review.comment?.trim())
    .map((review) => `${review.reviewed_at}: ${review.comment!.trim()}`)
    .join(" || ");
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { id } = await params;
  await requireEventManager(`/admin/events/${id}/attendance`);
  const admin = getPhaseOneAdminClient();

  const [
    eventResult,
    timeslotsResult,
    rosterResult,
    attendanceResult,
    insightsResult,
    reviewsResult,
    feedbackResult,
  ] = await Promise.all([
    admin
      .from("phaseone_events")
      .select("title, slug, venue")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("phaseone_event_timeslots")
      .select("id, label, starts_at, ends_at")
      .eq("event_id", id)
      .limit(5000),
    admin
      .from("phaseone_roster")
      .select("id, timeslot_id, volunteer_key, volunteer_name, email, mobile, tshirt_size, dietary_requirements, entry_method, attendance_person_key")
      .eq("event_id", id)
      .order("volunteer_name")
      .limit(10000),
    admin
      .from("phaseone_attendance_effective")
      .select("roster_id, signed_in_at, signed_out_at, non_attendance_status, non_attendance_marked_at, updated_at, session_id, session_checked_in_at, session_checked_out_at, continuation_type")
      .eq("event_id", id)
      .limit(10000),
    admin
      .from("phaseone_volunteer_insights")
      .select("volunteer_person_key, category, value, detail, source_type, review_status, captured_at, reviewed_at")
      .eq("event_id", id)
      .order("captured_at", { ascending: true })
      .limit(10000),
    admin
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
  ]);

  if (eventResult.error || !eventResult.data) {
    return NextResponse.json({ error: "Event could not be loaded." }, { status: 404 });
  }

  const event = eventResult.data;

  if (timeslotsResult.error || !timeslotsResult.data) {
    console.error("Event report export unavailable", { eventId: id, dataset: "timeslots", code: timeslotsResult.error?.code });
    return NextResponse.json({ error: "Event report export is unavailable." }, { status: 500 });
  }
  if (rosterResult.error || !rosterResult.data) {
    console.error("Event report export unavailable", { eventId: id, dataset: "roster", code: rosterResult.error?.code });
    return NextResponse.json({ error: "Event report export is unavailable." }, { status: 500 });
  }
  if (attendanceResult.error || !attendanceResult.data) {
    console.error("Event report export unavailable", { eventId: id, dataset: "attendance", code: attendanceResult.error?.code });
    return NextResponse.json({ error: "Event report export is unavailable." }, { status: 500 });
  }
  if (insightsResult.error || !insightsResult.data) {
    console.error("Event report export unavailable", { eventId: id, dataset: "insights", code: insightsResult.error?.code });
    return NextResponse.json({ error: "Event report export is unavailable." }, { status: 500 });
  }
  if (reviewsResult.error || !reviewsResult.data) {
    console.error("Event report export unavailable", { eventId: id, dataset: "reviews", code: reviewsResult.error?.code });
    return NextResponse.json({ error: "Event report export is unavailable." }, { status: 500 });
  }
  if (feedbackResult.error || !feedbackResult.data) {
    console.error("Event report export unavailable", { eventId: id, dataset: "feedback", code: feedbackResult.error?.code });
    return NextResponse.json({ error: "Event report export is unavailable." }, { status: 500 });
  }

  const timeslotById = new Map((timeslotsResult.data as Timeslot[]).map((timeslot) => [timeslot.id, timeslot]));
  const attendanceByRoster = new Map(attendanceResult.data.map((record) => [record.roster_id, record]));
  const insightsByPerson = groupByPersonKey(insightsResult.data as Insight[]);
  const reviewsByPerson = groupByPersonKey(reviewsResult.data as Review[]);
  const feedbackByPerson = new Map((feedbackResult.data as Feedback[]).map((feedback) => [feedback.volunteer_person_key, feedback]));

  const headers = [
    "event_title",
    "event_venue",
    "date",
    "shift",
    "shift_starts_at",
    "shift_ends_at",
    "volunteer_person_key",
    "volunteer_id",
    "volunteer_name",
    "contact_number",
    "email",
    "tshirt_size",
    "dietary_requirements",
    "roster_source",
    "attendance_status",
    "non_attendance_marked_at",
    "checked_in_at",
    "checked_out_at",
    "attendance_last_updated_at",
    "attendance_session_id",
    "continuous_attendance_type",
    "event_day_checked_in_at",
    "event_day_checked_out_at",
    "insight_count",
    "accepted_insight_count",
    "submitted_insight_count",
    "dismissed_insight_count",
    "insights",
    "staff_review_count",
    "average_rating",
    "review_ratings",
    "positive_behaviours",
    "concern_behaviours",
    "review_comments",
    "follow_up_required",
    "feedback_role_clarity",
    "feedback_role_satisfaction",
    "feedback_staff_support",
    "feedback_recommend",
    "feedback_suggestions",
    "feedback_follow_up_requested",
    "feedback_submitted_at",
  ];

  const rows = rosterResult.data.map((volunteer) => {
    const timeslot = timeslotById.get(volunteer.timeslot_id);
    const attendance = attendanceByRoster.get(volunteer.id);
    const personKey = volunteer.attendance_person_key;
    const insights = insightsByPerson.get(personKey) ?? [];
    const reviews = reviewsByPerson.get(personKey) ?? [];
    const feedback = feedbackByPerson.get(personKey);
    const averageRating = reviews.length > 0
      ? (reviews.reduce((total, review) => total + review.rating, 0) / reviews.length).toFixed(2)
      : "";

    const values: Array<string | null | undefined> = [
      event.title,
      event.venue,
      timeslot ? singaporeDate(timeslot.starts_at) : null,
      timeslot ? shiftLabel(timeslot) : null,
      timeslot?.starts_at,
      timeslot?.ends_at,
      personKey,
      volunteer.volunteer_key,
      volunteer.volunteer_name,
      volunteer.mobile,
      volunteer.email,
      volunteer.tshirt_size,
      volunteer.dietary_requirements,
      volunteer.entry_method === "walk_in" ? "Last-minute" : "Imported",
      attendanceStatus(attendance),
      attendance?.non_attendance_marked_at,
      attendance?.signed_in_at,
      attendance?.signed_out_at,
      attendance?.updated_at,
      attendance?.session_id,
      attendance?.continuation_type,
      attendance?.session_checked_in_at,
      attendance?.session_checked_out_at,
      String(insights.length),
      String(insights.filter((insight) => insight.review_status === "accepted").length),
      String(insights.filter((insight) => insight.review_status === "submitted").length),
      String(insights.filter((insight) => insight.review_status === "dismissed").length),
      insightText(insights),
      String(reviews.length),
      averageRating,
      reviews.map((review) => String(review.rating)).join(" | "),
      uniqueSorted(reviews.flatMap((review) => review.positive_behaviors ?? [])),
      uniqueSorted(reviews.flatMap((review) => review.concern_behaviors ?? [])),
      reviewComments(reviews),
      reviews.some((review) => review.follow_up_required) ? "yes" : "no",
      feedback ? String(feedback.role_clarity) : "",
      feedback ? String(feedback.role_satisfaction) : "",
      feedback ? String(feedback.staff_support) : "",
      feedback ? String(feedback.recommend) : "",
      feedback?.suggestions,
      feedback ? (feedback.follow_up_requested ? "yes" : "no") : "",
      feedback?.submitted_at,
    ];

    return values.map(csvCell).join(",");
  });

  const csv = [headers.map(csvCell).join(","), ...rows].join("\r\n");
  const filename = `${safeFilename(event.title)}-event-report.csv`;

  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
