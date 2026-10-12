-- Regression contract for MakLom-to-Keluarga identity propagation.
-- Exercises the live trigger and preserves all production data (transaction rolls back).
BEGIN;

SELECT plan(10);

CREATE TEMP TABLE maklom_identity_test AS
WITH inserted AS (
  INSERT INTO core.volunteers (
    display_name, primary_email_normalized, mobile, account_access_eligible
  ) VALUES (
    'Volunteer Initial 名字',
    'identity-guard-regression@example.test',
    '81234567',
    false
  ) RETURNING id
)
SELECT id AS core_id FROM inserted;

SELECT is(
  (SELECT core.ensure_maklom_profile_extension(core_id, 'keluarga_manual_roster')
   FROM maklom_identity_test),
  'created',
  'test volunteer has a MakLom profile'
);

-- Previously, touching name/email/phone (even with no change) wrote all
-- three old profile values into core.volunteers.
UPDATE public.volunteers p
SET name = p.name, email = p.email, phone = p.phone
WHERE p.core_volunteer_id = (SELECT core_id FROM maklom_identity_test);

SELECT is(
  (SELECT c.display_name FROM core.volunteers c JOIN maklom_identity_test t ON c.id=t.core_id),
  'Volunteer Initial 名字',
  'an unchanged MakLom update cannot rewrite a canonical name'
);

-- Simulate a more recent Keluarga self-service name. An unrelated profile
-- edit is safe; a stale MakLom name edit is rejected.
UPDATE core.volunteers
SET display_name = 'New Canonical 名字'
WHERE id=(SELECT core_id FROM maklom_identity_test);

UPDATE public.volunteers p
SET phone = '83334444'
WHERE p.core_volunteer_id=(SELECT core_id FROM maklom_identity_test);

SELECT is(
  (SELECT c.display_name FROM core.volunteers c JOIN maklom_identity_test t ON c.id=t.core_id),
  'New Canonical 名字',
  'a MakLom phone update does not restore an older name'
);

SELECT is(
  (SELECT c.mobile FROM core.volunteers c JOIN maklom_identity_test t ON c.id=t.core_id),
  '83334444',
  'unlinked staff-managed mobile changes propagate only to mobile'
);

SELECT throws_ok(
  $$
    UPDATE public.volunteers
    SET name='Staff Overwrite'
    WHERE core_volunteer_id=(SELECT core_id FROM maklom_identity_test)
  $$,
  'P0001',
  'Canonical volunteer name changed; reload before correcting',
  'a stale name edit requires an explicit resolution'
);

SELECT is(
  (SELECT c.display_name FROM core.volunteers c JOIN maklom_identity_test t ON c.id=t.core_id),
  'New Canonical 名字',
  'a rejected name edit leaves the canonical name intact'
);

UPDATE public.volunteers
SET email='updated-contact@example.test'
WHERE core_volunteer_id=(SELECT core_id FROM maklom_identity_test);

SELECT is(
  (SELECT c.primary_email_normalized FROM core.volunteers c JOIN maklom_identity_test t ON c.id=t.core_id),
  'updated-contact@example.test',
  'unlinked staff email correction affects only the email'
);

SELECT is(
  (SELECT c.mobile FROM core.volunteers c JOIN maklom_identity_test t ON c.id=t.core_id),
  '83334444',
  'updating email does not reset a canonical mobile'
);

-- A linked account has a verified login email. MakLom must not silently
-- overwrite it; staff-reviewed mobile is retained separately in MakLom.
INSERT INTO auth.users(id,email,email_confirmed_at)
VALUES ('99700000-0000-4000-8000-000000000095','updated-contact@example.test',now());

UPDATE core.volunteers
SET auth_user_id='99700000-0000-4000-8000-000000000095'
WHERE id=(SELECT core_id FROM maklom_identity_test);

UPDATE public.volunteers
SET phone='89998888'
WHERE core_volunteer_id=(SELECT core_id FROM maklom_identity_test);

SELECT is(
  (SELECT c.mobile FROM core.volunteers c JOIN maklom_identity_test t ON c.id=t.core_id),
  '83334444',
  'MakLom reviewed phone is distinct from a linked volunteer self-service mobile'
);

SELECT throws_ok(
  $$
    UPDATE public.volunteers
    SET email='different-verified-login@example.test'
    WHERE core_volunteer_id=(SELECT core_id FROM maklom_identity_test)
  $$,
  '42501',
  'Verified account email must be changed through account verification',
  'linked volunteers cannot have verified login email rewritten through MakLom'
);

SELECT * FROM finish();
ROLLBACK;
