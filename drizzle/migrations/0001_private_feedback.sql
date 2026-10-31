CREATE TABLE public.feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL DEFAULT auth.uid(),
 rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
 feedback_type text NOT NULL CHECK (feedback_type IN ('bug','usability','feature request','general')),
 comment text NOT NULL CHECK (char_length(comment) BETWEEN 1 AND 2000),
 app_version text CHECK (char_length(app_version) <= 80),
 device_context text CHECK (char_length(device_context) <= 200),
 contact_consent boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "submit own feedback" ON public.feedback FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "read own feedback or trusted admin" ON public.feedback FOR SELECT TO authenticated USING (owner_id = auth.uid() OR auth.jwt()->'app_metadata'->>'role' = 'admin');
CREATE INDEX feedback_owner_created ON public.feedback(owner_id, created_at DESC);
CREATE INDEX feedback_created ON public.feedback(created_at DESC);
CREATE FUNCTION public.limit_feedback_submission() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF (SELECT count(*) FROM public.feedback WHERE owner_id = auth.uid() AND created_at > now() - interval '1 hour') >= 10 THEN
  RAISE EXCEPTION 'Please wait before sending more feedback.';
 END IF;
 NEW.created_at := now();
 RETURN NEW;
END;
$$;
CREATE TRIGGER feedback_rate_limit BEFORE INSERT ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.limit_feedback_submission();