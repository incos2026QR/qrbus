
-- 1) RPC: lookup email by phone (anon allowed) — returns only email
CREATE OR REPLACE FUNCTION public.lookup_email_by_phone(_phone text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE phone = _phone LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.lookup_email_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_phone(text) TO anon, authenticated;

-- 2) RPC: find active driver by code (authenticated) — safe columns only
CREATE OR REPLACE FUNCTION public.find_driver_by_code(_code text)
RETURNS TABLE (
  id uuid,
  driver_code text,
  first_name text,
  paternal_surname text,
  qr_general_url text,
  qr_primaria_url text,
  qr_secundaria_url text,
  qr_adulto_url text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, driver_code, first_name, paternal_surname,
         qr_general_url, qr_primaria_url, qr_secundaria_url, qr_adulto_url
  FROM public.profiles
  WHERE upper(driver_code) = upper(_code)
    AND role = 'driver'
    AND status = 'active'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.find_driver_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_driver_by_code(text) TO authenticated;

-- 3) Reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  description text NOT NULL,
  driver_code text,
  transaction_id uuid,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  admin_notes text,
  resolver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports insert own"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "reports read own or staff"
  ON public.reports FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "reports update staff"
  ON public.reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE OR REPLACE FUNCTION public.reports_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_reports_updated_at ON public.reports;
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.reports_touch_updated_at();
