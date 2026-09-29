begin;

create or replace function public.maklom_match_or_create_volunteer(
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_recruited_year smallint default null,
  p_interests text default null,
  p_tags text[] default '{}'::text[],
  p_notes text default null,
  p_origin text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  return maklom_private.match_or_create_volunteer(
    p_name,
    p_email,
    p_phone,
    p_recruited_year,
    p_interests,
    p_tags,
    p_notes,
    p_origin
  );
end;
$$;

revoke all on function public.maklom_match_or_create_volunteer(
  text,text,text,smallint,text,text[],text,text
) from public, anon;
grant execute on function public.maklom_match_or_create_volunteer(
  text,text,text,smallint,text,text[],text,text
) to authenticated, service_role;

commit;
