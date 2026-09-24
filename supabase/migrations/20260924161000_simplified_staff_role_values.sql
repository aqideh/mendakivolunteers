begin;

alter type core.app_role
  add value if not exists 'volteam' before 'admin';

alter type core.app_role
  add value if not exists 'staff' before 'volteam';

alter type core.app_role
  add value if not exists 'volunteer_leader' before 'staff';

commit;
