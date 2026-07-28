ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS tickets integer NOT NULL DEFAULT 1;

CREATE TABLE public.wallet_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'qr',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.wallet_topups TO authenticated;
GRANT ALL ON public.wallet_topups TO service_role;
ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topups read own or staff" ON public.wallet_topups FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));

CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  amount numeric NOT NULL,
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "withdrawals read own or staff" ON public.withdrawals FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));

CREATE OR REPLACE FUNCTION public.fare_for_category(_c fare_category)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _c
    WHEN 'general' THEN 3.0
    WHEN 'primaria' THEN 1.0
    WHEN 'secundaria' THEN 2.0
    WHEN 'adulto_mayor' THEN 2.5
    WHEN 'discapacidad' THEN 2.5
    ELSE 3.0 END::numeric
$$;

CREATE OR REPLACE FUNCTION public.topup_wallet(_amount numeric, _method text DEFAULT 'qr')
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  UPDATE public.profiles SET balance = balance + _amount WHERE id = auth.uid() RETURNING balance INTO _bal;
  INSERT INTO public.wallet_topups (user_id, amount, method) VALUES (auth.uid(), _amount, coalesce(_method,'qr'));
  RETURN _bal;
END; $$;

CREATE OR REPLACE FUNCTION public.pay_fare(_driver_code text, _tickets integer)
RETURNS TABLE(verification_code text, total numeric, base_amount numeric, extra_amount numeric, category fare_category, new_balance numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  INSERT INTO public.transactions (driver_id, passenger_id, category, amount, verification_code, tickets)
  VALUES (_d.id, _p.id, coalesce(_p.category,'general'), _total, _code, _tickets);

  RETURN QUERY SELECT _code, _total, _base, _extra, coalesce(_p.category,'general')::fare_category, _bal;
END; $$;

CREATE OR REPLACE FUNCTION public.withdraw_earnings(_amount numeric, _destination text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  IF coalesce(trim(_destination),'') = '' THEN RAISE EXCEPTION 'Destino requerido'; END IF;
  SELECT balance INTO _bal FROM public.profiles WHERE id = auth.uid() AND role = 'driver';
  IF _bal IS NULL THEN RAISE EXCEPTION 'Solo choferes pueden retirar'; END IF;
  IF _bal < _amount THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
  UPDATE public.profiles SET balance = balance - _amount WHERE id = auth.uid() RETURNING balance INTO _bal;
  INSERT INTO public.withdrawals (driver_id, amount, destination) VALUES (auth.uid(), _amount, trim(_destination));
  RETURN _bal;
END; $$;