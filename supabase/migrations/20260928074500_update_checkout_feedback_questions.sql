begin;

alter table public.phaseone_event_feedback
  alter column role_clarity drop not null,
  alter column recommend drop not null;

alter table public.phaseone_event_feedback
  add column if not exists briefing_thorough smallint
    check (briefing_thorough between 1 and 5),
  add column if not exists onboarding_role_understanding smallint
    check (onboarding_role_understanding between 1 and 5);

comment on column public.phaseone_event_feedback.briefing_thorough is
  'Q9: The staff did a thorough briefing with the volunteers. 1 = Strongly Disagree, 5 = Strongly Agree.';
comment on column public.phaseone_event_feedback.onboarding_role_understanding is
  'Q10: The onboarding process helped me understand my volunteer role. 1 = Strongly Disagree, 5 = Strongly Agree.';
comment on column public.phaseone_event_feedback.role_satisfaction is
  'Q11: I am satisfied with the assigned role. 1 = Strongly Disagree, 5 = Strongly Agree.';
comment on column public.phaseone_event_feedback.staff_support is
  'Q12: MENDAKI staff are approachable and supportive. 1 = Strongly Disagree, 5 = Strongly Agree.';
comment on column public.phaseone_event_feedback.suggestions is
  'Q13: What can MENDAKI do to improve your volunteer experience?';

commit;
