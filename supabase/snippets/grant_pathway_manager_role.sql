-- Local development helper only.
-- Replace the email before running this in the local SQL editor.
insert into core.user_roles (user_id, role, reason)
select
  id,
  'pathway_manager'::core.app_role,
  'Local pathway editor access'
from auth.users
where lower(email) = lower('developer@example.test')
on conflict (user_id, role) do nothing;

update core.user_accounts
set status = 'active'
where id = (
  select id
  from auth.users
  where lower(email) = lower('developer@example.test')
  limit 1
);
