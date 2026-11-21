-- PR A / File 1: tighten grants on the two existing application tables.
-- Idempotent: REVOKE may be safely repeated.
-- Does not alter RLS, policies, functions, or service_role privileges.

REVOKE ALL PRIVILEGES
  ON TABLE public.ledger_records, public.feedback
  FROM PUBLIC, anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.ledger_records, public.feedback
  FROM authenticated;

REVOKE UPDATE, DELETE
  ON TABLE public.feedback
  FROM authenticated;
