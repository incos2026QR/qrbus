ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_account text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS longitude numeric;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS validation_code text;

DROP FUNCTION IF EXISTS public.find_driver_by_code(text);
CREATE FUNCTION public.find_driver_by_code(_code text)
RETURNS TABLE(id uuid, driver_code text, first_name text, paternal_surname text, bank_account text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT id, driver_code, first_name, paternal_surname, bank_account
  FROM public.profiles
  WHERE upper(driver_code) = upper(_code)
    AND role = 'driver'
    AND status = 'active'
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.pay_fare(_driver_code text, _tickets integer, _lat numeric DEFAULT NULL, _lng numeric DEFAULT NULL)
RETURNS TABLE(verification_code text, total numeric, base_amount numeric, extra_amount numeric, category fare_category, new_balance numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  _extra := (_tickets - 1) * 3.0;
  _total := _base + _extra;
  IF _p.balance < _total THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  _code := lpad(floor(random()*100000)::int::text, 5, '0');
  UPDATE public.profiles SET balance = balance - _total WHERE id = _p.id RETURNING balance INTO _bal;
  UPDATE public.profiles SET balance = balance + _total WHERE id = _d.id;
  INSERT INTO public.transactions (driver_id, passenger_id, category, amount, verification_code, tickets, latitude, longitude)
  VALUES (_d.id, _p.id, coalesce(_p.category,'general'), _total, _code, _tickets, _lat, _lng);

  RETURN QUERY SELECT _code, _total, _base, _extra, coalesce(_p.category,'general')::fare_category, _bal;
END; $function$;

DROP POLICY IF EXISTS "Passengers view own transactions" ON public.transactions;
CREATE POLICY "Passengers view own transactions" ON public.transactions
  FOR SELECT TO authenticated USING (passenger_id = auth.uid());

DROP POLICY IF EXISTS "Staff view all transactions" ON public.transactions;
CREATE POLICY "Staff view all transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));