CREATE TABLE public.ledger_records (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('space','account','category','transaction','budget','borrower','loan')),
  space_id uuid,
  data jsonb NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  rev integer NOT NULL DEFAULT 1,
  last_mutation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_records_owner_updated ON public.ledger_records (owner_id, updated_at);
CREATE INDEX ledger_records_owner_kind_space ON public.ledger_records (owner_id, kind, space_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_records TO authenticated;
GRANT ALL ON public.ledger_records TO service_role;

ALTER TABLE public.ledger_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.ledger_records FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own insert" ON public.ledger_records FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own update" ON public.ledger_records FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own delete" ON public.ledger_records FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Idempotent, optimistic-concurrency push. Runs as the caller, so RLS applies.
CREATE OR REPLACE FUNCTION public.push_record(
  p_id uuid, p_kind text, p_space_id uuid, p_data jsonb, p_deleted boolean, p_base_rev integer, p_mutation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE r public.ledger_records;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO r FROM public.ledger_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.ledger_records (id, owner_id, kind, space_id, data, deleted, rev, last_mutation_id)
    VALUES (p_id, auth.uid(), p_kind, p_space_id, p_data, p_deleted, 1, p_mutation_id)
    RETURNING * INTO r;
    RETURN jsonb_build_object('status','ok','rev',r.rev);
  END IF;
  IF r.last_mutation_id = p_mutation_id THEN
    RETURN jsonb_build_object('status','ok','rev',r.rev);
  END IF;
  IF r.rev <> p_base_rev THEN
    RETURN jsonb_build_object('status','conflict','rev',r.rev,'data',r.data,'deleted',r.deleted);
  END IF;
  UPDATE public.ledger_records
     SET data = p_data, deleted = p_deleted, space_id = p_space_id, rev = r.rev + 1,
         last_mutation_id = p_mutation_id, updated_at = now()
   WHERE id = p_id RETURNING * INTO r;
  RETURN jsonb_build_object('status','ok','rev',r.rev);
END;
$$;
REVOKE ALL ON FUNCTION public.push_record(uuid,text,uuid,jsonb,boolean,integer,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_record(uuid,text,uuid,jsonb,boolean,integer,uuid) TO authenticated;