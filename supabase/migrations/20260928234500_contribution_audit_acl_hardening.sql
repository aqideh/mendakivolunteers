begin;

revoke all on public.volunteer_contribution_audit from anon, authenticated;
grant select on public.volunteer_contribution_audit to authenticated;

revoke all on public.volunteer_contribution_audit from service_role;
grant select, insert on public.volunteer_contribution_audit to service_role;

revoke all on sequence public.volunteer_contribution_audit_id_seq from anon, authenticated;
grant usage, select on sequence public.volunteer_contribution_audit_id_seq to service_role;

comment on table public.volunteer_contribution_audit is
  'Append-only MakLom contribution review audit. Authenticated users may read only through RLS; trigger/service paths append history.';

commit;
