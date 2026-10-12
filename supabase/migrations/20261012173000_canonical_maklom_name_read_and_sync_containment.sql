-- Canonical MakLom identity containment: NO HISTORICAL DATA BACKFILL.
BEGIN;

ALTER TABLE public.volunteers ALTER COLUMN name DROP NOT NULL;

CREATE OR REPLACE FUNCTION core.ensure_maklom_profile_extension(p_volunteer_id uuid,p_origin text DEFAULT 'keluarga_native')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_name text; v_email text; v_mobile text; v_profile_id text;
BEGIN
  IF p_volunteer_id IS NULL THEN RAISE EXCEPTION 'Volunteer ID is required' USING errcode='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_volunteer_id::text,0));
  IF EXISTS (SELECT 1 FROM public.volunteers p WHERE p.core_volunteer_id=p_volunteer_id) THEN RETURN 'already_exists'; END IF;
  SELECT NULLIF(pg_catalog.btrim(c.display_name),''),
         NULLIF(pg_catalog.lower(pg_catalog.btrim(c.primary_email_normalized)),''),
         NULLIF(pg_catalog.btrim(c.mobile),'')
    INTO v_name,v_email,v_mobile FROM core.volunteers c WHERE c.id=p_volunteer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canonical volunteer does not exist' USING errcode='P0002'; END IF;
  IF v_email IS NULL AND v_mobile IS NULL THEN
    RAISE EXCEPTION 'MakLom profile requires volunteer email or mobile' USING errcode='22023';
  END IF;
  v_profile_id := 'vol_' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,20);
  INSERT INTO public.volunteers(id,core_volunteer_id,name,phone,email,profile_origin)
  VALUES(v_profile_id,p_volunteer_id,v_name,v_mobile,v_email,COALESCE(NULLIF(pg_catalog.btrim(p_origin),''),'keluarga_native'));
  RETURN 'created';
END;
$function$;

-- Transitional legacy write compatibility. Only ACTUALLY changed columns sync;
-- unchanged stale values cannot be replayed into canonical profile fields.
-- Remove this trigger once explicit, authorised canonical-field RPC callers replace it.
CREATE OR REPLACE FUNCTION maklom_private.sync_profile_to_core()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_code text; v_auth_user_id uuid; v_verified_email text;
        v_name text; v_email text; v_phone text;
BEGIN
  SELECT c.volunteer_code,c.auth_user_id,c.primary_email_normalized
    INTO v_code,v_auth_user_id,v_verified_email
    FROM core.volunteers c WHERE c.id=NEW.core_volunteer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canonical volunteer identity is missing' USING errcode='P0001'; END IF;
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    v_name := NULLIF(pg_catalog.btrim(NEW.name),'');
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Use an explicit identity correction to clear an existing name' USING errcode='22023';
    END IF;
    -- A volunteer code is an identifier, never a legal name.
    IF v_name IS DISTINCT FROM v_code THEN
      UPDATE core.volunteers SET display_name=v_name
      WHERE id=NEW.core_volunteer_id AND display_name IS DISTINCT FROM v_name;
    END IF;
  END IF;
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    v_email := NULLIF(pg_catalog.lower(pg_catalog.btrim(NEW.email)),'');
    IF v_auth_user_id IS NOT NULL AND v_email IS DISTINCT FROM v_verified_email THEN
      RAISE EXCEPTION 'Verified account email cannot be changed in the MakLom profile editor' USING errcode='42501';
    END IF;
    UPDATE core.volunteers SET primary_email_normalized=v_email
    WHERE id=NEW.core_volunteer_id AND primary_email_normalized IS DISTINCT FROM v_email;
  END IF;
  IF OLD.phone IS DISTINCT FROM NEW.phone THEN
    v_phone := NULLIF(pg_catalog.btrim(NEW.phone),'');
    UPDATE core.volunteers SET mobile=v_phone
    WHERE id=NEW.core_volunteer_id AND mobile IS DISTINCT FROM v_phone;
  END IF;
  RETURN NEW;
END;
$function$;

-- maklom_volunteer_directory: always read the actual canonical volunteer name.
CREATE OR REPLACE VIEW public.maklom_volunteer_directory WITH (security_invoker = true) AS
SELECT v.id,
    v.core_volunteer_id,
    c.volunteer_code,
    NULLIF(btrim(c.display_name), ''),
    v.nric,
    v.phone,
    v.email,
    v.gender,
    v.address,
    v.recruited_year,
    v.chat_session,
    v.chat_session_date,
    v.interests,
    v.languages_spoken,
    v.programmes_registered,
    v.tags,
    v.emergency_name,
    v.emergency_phone,
    v.shirt_size,
    v.dietary,
    v.notes,
    v.updated_at,
    v.row_version
   FROM volunteers v
     JOIN core.volunteers c ON c.id = v.core_volunteer_id;;

-- maklom_volunteer_search_directory: always read the actual canonical volunteer name.
CREATE OR REPLACE VIEW public.maklom_volunteer_search_directory WITH (security_invoker = true) AS
WITH attendance_summary AS (
         SELECT attendance_log.volunteer_id,
            count(*)::integer AS attendance_rows,
            COALESCE(sum(
                CASE
                    WHEN attendance_log.attended THEN COALESCE(attendance_log.staff_credited_duration_minutes, attendance_log.calculated_duration_minutes, attendance_log.duration_minutes, 0)
                    ELSE 0
                END), 0::bigint) AS total_credited_minutes,
            max(attendance_log.event_date) FILTER (WHERE attendance_log.attended) AS last_active
           FROM attendance_log
          WHERE attendance_log.volunteer_id IS NOT NULL
          GROUP BY attendance_log.volunteer_id
        )
 SELECT v.id,
    v.core_volunteer_id,
    c.volunteer_code,
    NULLIF(btrim(c.display_name), ''),
    v.nric,
    v.phone,
    v.email,
    v.gender,
    v.address,
    v.recruited_year,
    v.chat_session,
    v.chat_session_date,
    v.interests,
    v.languages_spoken,
    v.programmes_registered,
    v.tags,
    v.emergency_name,
    v.emergency_phone,
    v.shirt_size,
    v.dietary,
    v.notes,
    v.updated_at,
    v.row_version,
    COALESCE(a.attendance_rows, 0) AS attendance_rows,
    COALESCE(a.total_credited_minutes, 0::bigint) AS total_credited_minutes,
    a.last_active,
    COALESCE(( SELECT min(tag.tag) AS min
           FROM unnest(v.tags) tag(tag)), ''::text) AS first_tag,
    lower(concat_ws(' '::text, c.volunteer_code, NULLIF(btrim(c.display_name), ''), v.phone, v.email, v.gender, v.address, v.neighbourhood, v.planning_area, v.electoral_division, v.recruited_year::text, v.chat_session, v.chat_session_date::text, v.interests, v.languages_spoken, array_to_string(v.programmes_registered, ' '::text), array_to_string(v.tags, ' '::text), v.shirt_size, v.dietary, v.notes)) AS search_text,
    v.neighbourhood,
    v.planning_area,
    v.electoral_division
   FROM volunteers v
     JOIN core.volunteers c ON c.id = v.core_volunteer_id
     LEFT JOIN attendance_summary a ON a.volunteer_id = v.id;;

-- maklom_volunteer_search_v2: always read the actual canonical volunteer name.
CREATE OR REPLACE VIEW public.maklom_volunteer_search_v2 WITH (security_invoker = true) AS
WITH attended AS (
         SELECT p.core_volunteer_id,
            COALESCE(array_agg(DISTINCT p.event_title ORDER BY p.event_title) FILTER (WHERE NULLIF(btrim(p.event_title), ''::text) IS NOT NULL), '{}'::text[]) AS attended_events
           FROM maklom_event_participation p
          GROUP BY p.core_volunteer_id
        ), registered AS (
         SELECT r_1.volunteer_id AS core_volunteer_id,
            count(DISTINCT r_1.event_id)::integer AS registered_event_count,
            COALESCE(array_agg(DISTINCT e.title ORDER BY e.title) FILTER (WHERE NULLIF(btrim(e.title), ''::text) IS NOT NULL), '{}'::text[]) AS registered_events
           FROM phaseone_roster r_1
             JOIN phaseone_events e ON e.id = r_1.event_id
          WHERE r_1.volunteer_id IS NOT NULL
          GROUP BY r_1.volunteer_id
        )
 SELECT v.id,
    v.core_volunteer_id,
    cv.volunteer_code,
    NULLIF(btrim(cv.display_name), ''),
    v.nric,
    v.email,
    v.phone,
    v.gender,
    v.address,
    v.neighbourhood,
    v.planning_area,
    v.electoral_division,
    v.recruited_year,
    v.chat_session,
    v.chat_session_date,
    v.interests,
    v.languages_spoken,
    v.programmes_registered,
    v.tags,
    v.emergency_name,
    v.emergency_phone,
    v.shirt_size,
    v.dietary,
    v.notes,
    v.updated_at,
    v.row_version,
    COALESCE(i.event_count, 0) AS attended_event_count,
    COALESCE(r.registered_event_count, 0) AS registered_event_count,
    COALESCE(i.historical_credited_minutes, 0::bigint) + COALESCE(i.approved_keluarga_minutes, 0::bigint) AS total_credited_minutes,
    i.first_event_date,
    i.last_event_date AS last_active,
    COALESCE(i.events_last_90d, 0) AS events_last_90d,
    COALESCE(i.active_last_90d, false) AS active_last_90d,
    COALESCE(a.attended_events, '{}'::text[]) AS attended_events,
    COALESCE(r.registered_events, '{}'::text[]) AS registered_events,
    COALESCE(( SELECT min(tag.tag) AS min
           FROM unnest(v.tags) tag(tag)), ''::text) AS first_tag,
    lower(concat_ws(' '::text, cv.volunteer_code, NULLIF(btrim(cv.display_name), ''), v.nric, v.phone, v.email, v.gender, v.address, v.neighbourhood, v.planning_area, v.electoral_division, v.recruited_year::text, v.chat_session, v.chat_session_date::text, v.interests, v.languages_spoken, array_to_string(v.programmes_registered, ' '::text), array_to_string(v.tags, ' '::text), v.emergency_name, v.emergency_phone, v.shirt_size, v.dietary, v.notes, array_to_string(COALESCE(a.attended_events, '{}'::text[]), ' '::text), array_to_string(COALESCE(r.registered_events, '{}'::text[]), ' '::text))) AS search_text,
        CASE
            WHEN pd.date_of_birth IS NOT NULL AND pd.date_of_birth <= (now() AT TIME ZONE 'Asia/Singapore'::text)::date THEN EXTRACT(year FROM age((now() AT TIME ZONE 'Asia/Singapore'::text)::date::timestamp with time zone, pd.date_of_birth::timestamp with time zone))::integer
            WHEN pd.date_of_birth IS NULL AND cv.age >= 0 THEN cv.age::integer
            ELSE NULL::integer
        END AS age,
        CASE
            WHEN pd.date_of_birth IS NOT NULL THEN 'date_of_birth'::text
            WHEN cv.age >= 0 THEN 'staff_recorded'::text
            ELSE NULL::text
        END AS age_source,
    pd.date_of_birth
   FROM volunteers v
     JOIN core.volunteers cv ON cv.id = v.core_volunteer_id
     LEFT JOIN volunteer_private_details pd ON pd.volunteer_id = cv.id
     LEFT JOIN maklom_volunteer_intelligence i ON i.core_volunteer_id = v.core_volunteer_id
     LEFT JOIN attended a ON a.core_volunteer_id = v.core_volunteer_id
     LEFT JOIN registered r ON r.core_volunteer_id = v.core_volunteer_id;;

COMMIT;
