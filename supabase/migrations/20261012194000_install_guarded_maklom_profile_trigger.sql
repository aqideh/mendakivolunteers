-- Ensure MakLom's canonical identity trigger exists on clean databases.
-- Production already has this trigger; replace it with the guarded function
-- installed by the preceding migration. This does not update any volunteer rows.
BEGIN;
DROP TRIGGER IF EXISTS volunteers_sync_profile_to_core ON public.volunteers;
CREATE TRIGGER volunteers_sync_profile_to_core
AFTER UPDATE OF name, email, phone ON public.volunteers
FOR EACH ROW
EXECUTE FUNCTION maklom_private.sync_profile_to_core();
COMMIT;
