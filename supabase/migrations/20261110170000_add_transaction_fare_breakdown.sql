BEGIN;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS fare_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.pay_fare_group(
  _driver_code text,
  _companions public.fare_category[] DEFAULT '{}',
  _lat numeric DEFAULT NULL,
  _lng numeric DEFAULT NULL
)
RETURNS TABLE(
  verification_code text,
  total numeric,
  base_amount numeric,
  extra_amount numeric,
  category public.fare_category,
  tickets integer,
  new_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _p public.passengers%ROWTYPE;
  _d public.drivers%ROWTYPE;
  _base numeric;
  _extra numeric := 0;
  _total numeric;
  _code text;
  _passenger_balance numeric;
  _ticket_count integer;
  _category public.fare_category;
  _fare_breakdown jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  _ticket_count := 1 + coalesce(array_length(_companions, 1), 0);
  IF _ticket_count > 10 THEN
    RAISE EXCEPTION 'Máximo 10 pasajes';
  END IF;

  SELECT * INTO _p
  FROM public.passengers
  WHERE id = auth.uid()
  FOR UPDATE;

  IF _p.id IS NULL OR _p.status <> 'active' THEN
    RAISE EXCEPTION 'Pasajero no activo';
  END IF;

  SELECT * INTO _d
  FROM public.drivers
  WHERE upper(driver_code) = upper(trim(_driver_code))
    AND status = 'active'
  FOR UPDATE;

  IF _d.id IS NULL THEN
    RAISE EXCEPTION 'Chofer no encontrado o no activo';
  END IF;

  _base := public.fare_for_category(_p.fare_category);
  IF _companions IS NOT NULL THEN
    FOREACH _category IN ARRAY _companions LOOP
      _extra := _extra + public.fare_for_category(_category);
    END LOOP;
  END IF;

  _total := _base + _extra;
  IF _p.balance < _total THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;

  _fare_breakdown := jsonb_build_array(
    jsonb_build_object(
      'category', _p.fare_category::text,
      'tickets', 1,
      'amount', _base,
      'kind', 'titular'
    )
  );
  IF coalesce(array_length(_companions, 1), 0) > 0 THEN
    SELECT _fare_breakdown || coalesce(
      jsonb_agg(
        jsonb_build_object(
          'category', companions.category::text,
          'tickets', companions.tickets,
          'amount', companions.amount,
          'kind', 'acompanante'
        )
        ORDER BY companions.category
      ),
      '[]'::jsonb
    )
    INTO _fare_breakdown
    FROM (
      SELECT
        companion.category,
        count(*)::integer AS tickets,
        public.fare_for_category(companion.category) * count(*) AS amount
      FROM unnest(_companions) AS companion(category)
      GROUP BY companion.category
    ) AS companions;
  END IF;

  _code := lpad(floor(random() * 100000)::integer::text, 5, '0');
  PERFORM set_config('qrbus.trusted_balance_write', 'on', true);

  UPDATE public.passengers
  SET balance = balance - _total
  WHERE id = _p.id
  RETURNING balance INTO _passenger_balance;

  UPDATE public.drivers
  SET balance = balance + _total
  WHERE id = _d.id;

  INSERT INTO public.transactions (
    driver_id, passenger_id, category, amount, verification_code,
    tickets, latitude, longitude, fare_breakdown
  ) VALUES (
    _d.id, _p.id, _p.fare_category, _total, _code,
    _ticket_count, _lat, _lng, _fare_breakdown
  );

  RETURN QUERY
  SELECT _code, _total, _base, _extra, _p.fare_category,
         _ticket_count, _passenger_balance;
END;
$$;

COMMIT;
