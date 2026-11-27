BEGIN;

GRANT SELECT ON public.admins_supervisors TO authenticated;
ALTER TABLE public.admins_supervisors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff read" ON public.admins_supervisors;
CREATE POLICY "staff read" ON public.admins_supervisors
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.bancos, public.lineas_transporte TO anon, authenticated;
ALTER TABLE public.bancos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineas_transporte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public catalog read" ON public.bancos;
CREATE POLICY "public catalog read" ON public.bancos
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public catalog read" ON public.lineas_transporte;
CREATE POLICY "public catalog read" ON public.lineas_transporte
  FOR SELECT TO anon, authenticated
  USING (true);

COMMIT;
