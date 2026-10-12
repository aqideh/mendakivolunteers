-- Protect canonical volunteer identity from unrelated MakLom profile updates.
-- Keluarga owns authenticated identity and self-service mobile; MakLom
-- retains its separate reviewed contact number.
CREATE OR REPLACE FUNCTION maklom_private.sync_profile_to_core()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  canonical core.volunteers%ROWTYPE;
  old_email text := NULLIF(pg_catalog.lower(pg_catalog.btrim(OLD.email)), '');
  next_email text := NULLIF(pg_catalog.lower(pg_catalog.btrim(NEW.email)), '');
  old_phone text := NULLIF(pg_catalog.btrim(OLD.phone), '');
  next_phone text := NULLIF(pg_catalog.btrim(NEW.phone), '');
  old_name text := NULLIF(pg_catalog.btrim(OLD.name), '');
  next_name text := NULLIF(pg_catalog.btrim(NEW.name), '');
BEGIN
  IF OLD.name IS NOT DISTINCT FROM NEW.name
     AND OLD.email IS NOT DISTINCT FROM NEW.email
     AND OLD.phone IS NOT DISTINCT FROM NEW.phone THEN
    RETURN NEW;
  END IF;

  SELECT * INTO canonical
  FROM core.volunteers c
  WHERE c.id = NEW.core_volunteer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical volunteer identity is missing' USING errcode = 'P0001';
  END IF;

  IF OLD.name IS DISTINCT FROM NEW.name THEN
    IF next_name IS NULL OR next_name = canonical.volunteer_code THEN
      RAISE EXCEPTION 'Volunteer name cannot be blank or a volunteer code' USING errcode = '22023';
    END IF;
    IF canonical.display_name IS DISTINCT FROM old_name
       AND canonical.display_name IS DISTINCT FROM next_name
       AND canonical.display_name IS NOT NULL THEN
      RAISE EXCEPTION 'Canonical volunteer name changed; reload before correcting'
        USING errcode = 'P0001';
    END IF;
    UPDATE core.volunteers
    SET display_name = next_name
    WHERE id = canonical.id AND display_name IS DISTINCT FROM next_name;
  END IF;

  IF OLD.email IS DISTINCT FROM NEW.email THEN
    IF canonical.auth_user_id IS NOT NULL
       AND canonical.primary_email_normalized IS DISTINCT FROM next_email THEN
      RAISE EXCEPTION 'Verified account email must be changed through account verification'
        USING errcode = '42501';
    END IF;
    IF canonical.auth_user_id IS NULL THEN
      IF canonical.primary_email_normalized IS DISTINCT FROM old_email
         AND canonical.primary_email_normalized IS NOT NULL THEN
        RAISE EXCEPTION 'Canonical volunteer email changed; reload before correcting'
          USING errcode = 'P0001';
      END IF;
      UPDATE core.volunteers SET primary_email_normalized = next_email
      WHERE id = canonical.id AND primary_email_normalized IS DISTINCT FROM next_email;
    END IF;
  END IF;

  IF OLD.phone IS DISTINCT FROM NEW.phone AND canonical.auth_user_id IS NULL THEN
    IF NULLIF(pg_catalog.btrim(canonical.mobile), '') IS DISTINCT FROM old_phone
       AND canonical.mobile IS NOT NULL THEN
      RAISE EXCEPTION 'Canonical volunteer mobile changed; reload before correcting'
        USING errcode = 'P0001';
    END IF;
    UPDATE core.volunteers SET mobile = next_phone
    WHERE id = canonical.id AND mobile IS DISTINCT FROM next_phone;
  END IF;

  RETURN NEW;
END;
$function$;
