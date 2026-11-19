-- PR A / File 2: restrict defaults for objects created by postgres in public.
--
-- PARTIAL BY DESIGN:
-- The live migration connection is postgres, not a superuser and not a member
-- of supabase_admin. It cannot alter supabase_admin's default privileges.
-- Those defaults remain unchanged and must be handled by an authorized role
-- in a separately approved migration if needed.
--
-- Existing objects are NOT changed by ALTER DEFAULT PRIVILEGES.
-- Authenticated defaults are intentionally retained to avoid breaking future
-- Lovable-generated application tables/sequences/functions. New objects still
-- require explicit RLS policies and explicit review of their grants.
-- Future schema changes may need explicit GRANTs because anon defaults are removed.
--
-- Idempotent: repeated REVOKE statements leave the same default ACL.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;
