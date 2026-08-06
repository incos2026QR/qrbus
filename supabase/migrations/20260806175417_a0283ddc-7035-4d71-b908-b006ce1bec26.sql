CREATE TABLE public.tarifas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  precio numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tarifas TO anon;
GRANT SELECT ON public.tarifas TO authenticated;
GRANT ALL ON public.tarifas TO service_role;

ALTER TABLE public.tarifas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarifas lectura publica" ON public.tarifas
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "tarifas admin gestiona" ON public.tarifas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_tarifas_updated_at
BEFORE UPDATE ON public.tarifas
FOR EACH ROW EXECUTE FUNCTION public.reports_touch_updated_at();

INSERT INTO public.tarifas (tipo, nombre, precio) VALUES
  ('general', 'General', 2.00),
  ('secundaria', 'Universitario', 1.00),
  ('primaria', 'Escolar', 0.80),
  ('adulto_mayor', 'Adulto Mayor', 1.00),
  ('discapacidad', 'Persona con Discapacidad', 1.00);

CREATE OR REPLACE FUNCTION public.fare_for_category(_c fare_category)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT coalesce((SELECT precio FROM public.tarifas WHERE tipo = _c::text), 2.0)::numeric
$function$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS transport_line text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS union_doc_url text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS resubmission_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.pay_fare(_driver_code text, _tickets integer, _lat numeric DEFAULT NULL::numeric, _lng numeric DEFAULT NULL::numeric)
 RETURNS TABLE(verification_code text, total numeric, base_amount numeric, extra_amount numeric, category fare_category, new_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _p public.profiles%ROWTYPE;
  _d public.profiles%ROWTYPE;
  _base numeric; _extra numeric; _total numeric; _code text; _bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _tickets IS NULL OR _tickets < 1 OR _tickets > 10 THEN RAISE EXCEPTION 'Cantidad de pasajes inválida'; END IF;
  SELECT * INTO _p FROM public.profiles WHERE id = auth.uid();
  IF _p.id IS NULL OR _p.status <> 'active' THEN RAISE EXCEPTION 'Pasajero no activo'; END IF;
  SELECT * INTO _d FROM public.profiles WHERE upper(driver_code) = upper(_driver_code) AND role = 'driver' AND status = 'active';
  IF _d.id IS NULL THEN RAISE EXCEPTION 'Chofer no encontrado o no activo'; END IF;

  _base := public.fare_for_category(coalesce(_p.category, 'general'));
  _extra := (_tickets - 1) * public.fare_for_category('general');
  _total := _base + _extra;
  IF _p.balance < _total THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  _code := lpad(floor(random()*100000)::int::text, 5, '0');
  UPDATE public.profiles SET balance = balance - _total WHERE id = _p.id RETURNING balance INTO _bal;
  UPDATE public.profiles SET balance = balance + _total WHERE id = _d.id;
  INSERT INTO public.transactions (driver_id, passenger_id, category, amount, verification_code, tickets, latitude, longitude)
  VALUES (_d.id, _p.id, coalesce(_p.category,'general'), _total, _code, _tickets, _lat, _lng);

  RETURN QUERY SELECT _code, _total, _base, _extra, coalesce(_p.category,'general')::fare_category, _bal;
END; $function$;