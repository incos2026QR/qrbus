CREATE OR REPLACE FUNCTION public.pay_fare_group(
  _driver_code text,
  _companions fare_category[] DEFAULT '{}'::fare_category[],
  _lat numeric DEFAULT NULL,
  _lng numeric DEFAULT NULL
)
RETURNS TABLE(verification_code text, total numeric, base_amount numeric, extra_amount numeric, category fare_category, tickets integer, new_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _p public.profiles%ROWTYPE;
  _d public.profiles%ROWTYPE;
  _base numeric; _extra numeric := 0; _total numeric; _code text; _bal numeric;
  _c fare_category; _n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  _n := 1 + coalesce(array_length(_companions, 1), 0);
  IF _n > 10 THEN RAISE EXCEPTION 'Cantidad de pasajes inválida'; END IF;

  SELECT * INTO _p FROM public.profiles WHERE id = auth.uid();
  IF _p.id IS NULL OR _p.status <> 'active' THEN RAISE EXCEPTION 'Pasajero no activo'; END IF;
  SELECT * INTO _d FROM public.profiles WHERE upper(driver_code) = upper(_driver_code) AND role = 'driver' AND status = 'active';
  IF _d.id IS NULL THEN RAISE EXCEPTION 'Chofer no encontrado o no activo'; END IF;

  _base := public.fare_for_category(coalesce(_p.category, 'general'));
  IF _companions IS NOT NULL THEN
    FOREACH _c IN ARRAY _companions LOOP
      _extra := _extra + public.fare_for_category(_c);
    END LOOP;
  END IF;
  _total := _base + _extra;
  IF _p.balance < _total THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  _code := lpad(floor(random()*100000)::int::text, 5, '0');
  UPDATE public.profiles SET balance = balance - _total WHERE id = _p.id RETURNING balance INTO _bal;
  UPDATE public.profiles SET balance = balance + _total WHERE id = _d.id;
  INSERT INTO public.transactions (driver_id, passenger_id, category, amount, verification_code, tickets, latitude, longitude)
  VALUES (_d.id, _p.id, coalesce(_p.category,'general'), _total, _code, _n, _lat, _lng);

  RETURN QUERY SELECT _code, _total, _base, _extra, coalesce(_p.category,'general')::fare_category, _n, _bal;
END; $function$;

GRANT EXECUTE ON FUNCTION public.pay_fare_group(text, fare_category[], numeric, numeric) TO authenticated;