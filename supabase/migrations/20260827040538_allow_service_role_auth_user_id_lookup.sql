revoke select (id) on table auth.users from anon, authenticated;
grant select (id) on table auth.users to service_role;
