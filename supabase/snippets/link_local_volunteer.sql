-- Local development helper only.
-- Replace the email before running this in the local SQL editor.
update core.volunteers
set auth_user_id = (
  select id
  from auth.users
  where lower(email) = lower('developer@example.test')
  limit 1
)
where ymhub_volunteer_id = 'PROTO-VOL-000001';

update core.user_accounts
set status = 'active'
where id = (
  select id
  from auth.users
  where lower(email) = lower('developer@example.test')
  limit 1
);
