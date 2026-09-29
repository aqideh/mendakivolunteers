begin;

revoke execute on function public.issue_volunteer_shirt(uuid,text,text,uuid,text)
  from public, anon, authenticated;
revoke execute on function public.mark_previous_volunteer_shirt_issue(uuid,text,text,timestamptz,text)
  from public, anon, authenticated;
revoke execute on function public.record_volunteer_shirt_stock(text,text,integer,text,text)
  from public, anon, authenticated;

drop function public.issue_volunteer_shirt(uuid,text,text,uuid,text);
drop function public.mark_previous_volunteer_shirt_issue(uuid,text,text,timestamptz,text);
drop function public.record_volunteer_shirt_stock(text,text,integer,text,text);

commit;
